# SOURCE — Founder: External-Data Discovery Pass, Granada/Jaén/Almería/Cádiz/Huelva (raw capture)

> **Provenance.** Founder-provided research, delivered 2026-08-03 as a multi-pass deepening (four
> successive messages) in direct response to this session's own
> [`ANDALUSIAN-CAPITALS-FORENSIC-AUDIT.md`](../ANDALUSIAN-CAPITALS-FORENSIC-AUDIT.md), which found
> zero PRYZM code/investigation for these five capitals. Captured **condensed** (the four passes
> repeat and narrow each other; only the final, most-specific claim per city is kept in full,
> earlier passes summarized). §Verification is mine.
>
> ⚠ **This does not change the repo-investigation-status finding.** The forensic audit's claim —
> "zero code hits in `rulepacks/`, `providers/`, `server/`; each city has exactly 1 scaffold commit"
> — is a **git-verified fact about this codebase** and is unaffected by what the public internet
> publishes. What this capture adds is **candidate external-data-availability evidence** for a
> *future* discovery pass to start from — it is not evidence that PRYZM has investigated anything.
> Conflating "the repo hasn't looked" with "nothing exists to look at" was exactly the error
> `ADR-0296` was written to prevent, and conflating "found an endpoint" with "found the *right*
> layer" is a second, related error this capture's own verification catches once (Granada, below).

**Framing across all four passes**: moves from "no evidence for any of the five" → claims Granada
and Jaén are "likely unblocked" → claims 7 of 8 capitals have some form of digital planning
infrastructure → final framing: *"the question is no longer 'does planning exist?' but 'can PRYZM
compute a buildable envelope without human intervention?'"*, evaluated per-city against a 5-stage
pipeline (Legislation → GIS → Geometry → Ordinance identifier → Rules).

## Granada (18087) — claimed strongest case; PARTIALLY confirmed, with a correction

**Claim**: Granada's provincial SDI (`idegranada.dipgra.es`) exposes a dedicated **URBANISMO**
ArcGIS REST folder with queryable services (JSON/GeoJSON/PBF), EPSG:25830, including "Clasificación
del Suelo," municipal planning boundaries, general planning structure, industrial land, and cadastral
parcels — moving Granada from "no evidence" to *"technically unblocked... the remaining work is
schema inspection, measured in hours."*

**§Verification (mine)**: The folder and services **do exist, confirmed live** — 7 services:
`CLASIFICACION_DEL_SUELO`, `DELIMITACION_MUNICIPAL`, `EDIFICACION_EN_RUSTICO` (Feature+MapServer),
`ESTRUCTURA_GENERAL`, `Parcelas_Catastrales_2024`, `SUELO_INDUSTRIAL`, and one raw-named rustic-
buildings layer. `ESTRUCTURA_GENERAL` confirmed at EPSG:25830, one polygon layer plus a data table.

**⚠ The correction**: the dossier's own text conflates two legally distinct Spanish planning
concepts. What's confirmed live is **`CLASIFICACION_DEL_SUELO`** (*clasificación* — the coarse
urban/urbanizable/no-urbanizable determination) and **`ESTRUCTURA_GENERAL`** (general structure, not
parcel-level rule). Neither is **`Calificación`** (the fine-grained zoning/ordenanza code that
actually carries height/FAR/setback parameters — the layer Córdoba's `coaco:ordenanzas` and Málaga's
`muralPGOU:POLCALIF_T` are, and the layer this whole session's audits have repeatedly found is the
actual bottleneck once *clasificación* is solved). **No `CALIFICACION`-named or ordenanza-parameter
service was found in this folder's 7-item listing.** This is exactly the Córdoba/Málaga pattern
repeating a third time: the coarse classification layer is easy to find and often already public;
the fine-grained ordinance layer is the layer that actually matters and is the one that keeps not
being there. Downgrade the dossier's "technically unblocked, hours" claim to: **a real, confirmed
entry point exists for classification/structure, but the parcel-level ordinance/calificación layer
— the one that would actually drive an envelope — has not yet been found or confirmed absent.**

## Jaén (23050) — official planning portal confirmed; GIS service unconfirmed

**Claim**: `planesdeordenacion.aytojaen.es` is a dedicated municipal portal publishing PGOM, POU, and
historic-centre planning documents. This proves a digital publication workflow exists but **not** GIS
layers or machine-readable zoning — the dossier's own assessment downgrades this from "unblocked" to
"likely unblocked, GIS discovery incomplete" across its later passes. **Not independently verified
this session** (not fetched).

## Almería (04013) — planning viewer claimed; underlying service architecture unknown

**Claim**: `almeriaciudad.es` states the PGOU has been incorporated into an online *visor
urbanístico* (planning viewer) for continuous consultation, with the department requiring formal
parcel-referenced planning applications against it. The dossier's own assessment: this proves a
viewer exists but not which backend serves it (ArcGIS/GeoServer/vector tiles all remain open) —
"reverse-engineering the viewer" is named as the actual next task, not more searching. **Not
independently verified this session.**

## Cádiz (11012) — PGOU + provincial GeoServer both confirmed to exist; municipal-layer link unconfirmed

**Claim**: `transparencia.cadiz.es` publishes the full PGOU (regulations, drawings, legal docs).
Separately, `dipucadiz.es/idecadiz` operates a provincial GeoServer with OGC WMS/WFS services. The
dossier's own assessment is careful here — it explicitly does **not** claim these two are connected:
*"What has not yet been established is whether the municipal zoning layers themselves are exposed
through that GeoServer."* Named as one specific, answerable technical question: can "PO 3-1 —
Calificación y regulación del suelo urbano" be queried as vector features via that GeoServer, or is
it plans/PDFs only? **Not independently verified this session** — this is the most honestly-scoped
claim in the capture and the right place to start if this thread is picked up.

## Huelva (21041) — revised from "no data" to "documents confirmed, GIS service still unconfirmed"

**Claim**: `huelva.es` publishes the PGOU, adapted planning documentation, classification plans, and
detailed development planning as documents. This narrows Huelva's blocker from "does anything exist"
to "where is the spatial/GIS service, if any" — but **does not resolve** the forensic audit's own
Huelva finding, which was specifically about **GIS endpoint reachability** (`sig.huelva.es` DNS
failure, 12/13 hosts unreachable), not about whether planning *documents* are published. Both can be
true simultaneously: Huelva publishes PGOU documents (now claimed) while its GIS-service endpoint
remains unreached (previously measured). **Not independently verified this session.**

## What this changes about the regional audit, honestly

Per `ANDALUSIAN-CAPITALS-FORENSIC-AUDIT.md`'s own "Root blocker: Research" classification for all
five — **that classification is unchanged**. What this capture provides is a **prioritized starting
point** for whoever runs that research: Cádiz's one specific WFS-namespace question and Granada's
now-confirmed-but-wrong-layer entry point are the cheapest next checks; Almería needs viewer
reverse-engineering; Jaén and Huelva need a GIS-service sweep independent of their confirmed document
publication. None of these five should be marked "research complete" or have their per-municipality
`FORENSIC-BLOCKER-AUDIT-2026-08-03.md` status changed from "Research only" based on this capture
alone — every claim above is marked unverified-this-session except Granada's endpoint existence,
which was checked and found to point at the wrong layer for envelope purposes.
