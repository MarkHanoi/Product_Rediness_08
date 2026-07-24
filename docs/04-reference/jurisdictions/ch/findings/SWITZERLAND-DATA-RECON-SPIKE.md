# Switzerland — Data Recon Spike (deciding-probe transcript)

**Dated:** 2026-07-24 · **Probe origin:** non-DACH (US-region) egress · **Maintainer:** UNASSIGNED
**Status:** THE DECIDING PROBE IS DONE. Verdict recorded below with verbatim evidence.

> This is the full transcript for the one probe the prior (ChatGPT) recon pass could not land before
> its quota ran out: **does Switzerland expose structured numeric zoning attributes (Ausnützungsziffer /
> Geschosszahl / Gebäudehöhe) per zone polygon, or only a zone code + a link to a cantonal PDF?** The
> answer decides whether the aspirational "~88%" is a real numeric-fill rate.
>
> Prior work (all confirmed, do not re-run): `RATE.md` live-probe record, `SOURCES.md §A`,
> `findings/SWITZERLAND-MASTER-DATA-SOURCE-STUDY.md`. This spike RESOLVES the single `NOT PROBED` /
> `geo-blocked` row those docs left open, plus the three unfinished content probes.

---

## 0 — VERDICT (read this first)

**Outcome B — numeric fill is model/PDF-bound, NOT Outcome A.** The aspirational ~88% is **not** a real
structured-numeric fill rate. The honest split, on the *identical cross-jurisdiction ruler* (zone/use
code **+** a density metric **+** height, all machine-readable, no PDF read):

| Axis | Honest rate | Basis |
|---|---|---|
| **Context-data layer** (3D physical context: buildings, terrain, roads, water, parks, trees) | **~85%** | genuinely strong — among the best in the benchmark; confirmed from swisstopo/BFS products + live STAC/GWR probes |
| **Building-rule structured dimensional fill** (the *comparable* number) | **~20–25%** | zone-ID high; FAR model-slotted but not nationally delivered; height/setback PDF-bound |

**Switzerland is France-class on the comparable ruler, not Denmark-class** — but with a *structurally
stronger ceiling than France*: the federal data model carries a **typed FAR slot** (`Nutzungsziffer :
0.00 .. 9.00`) that France's prose règlements lack. See §2 for why that raises the ceiling without
raising today's delivered number.

The "~88%, highest of any jurisdiction" claim conflated the **context-data axis** (~85%, a *different*
axis from the comparable building-rule ruler) with an **unproven Outcome-A hypothesis** for the legal
layer. This spike closes Outcome A: the number is not in the national structured delivery.

---

## 1 — THE DECIDING PROBE: geodienste.ch national Nutzungsplanung WFS

**Endpoint:** `https://geodienste.ch/db/npl_nutzungsplanung_v1_2_0/deu` (WFS 2.0.0, MGDM 73.1,
INTERLIS `Nutzungsplanung_V1_2`, 19+ cantons). **Result: reachable from this origin — NOT geo-blocked
for the WFS** (the prior pass's geo-block was ZG's *cantonal* WFS, a different host).

### 1.1 — `DescribeFeatureType` for `ms:grundnutzung` (the zone-polygon feature type)

`REQUEST=DescribeFeatureType&TYPENAMES=ms:grundnutzung` → **HTTP 200**, verbatim schema:

```xml
<complexType name="grundnutzungType">
  <complexContent><extension base="gml:AbstractFeatureType"><sequence>
    <element name="wkb_geometry" type="gml:GeometryPropertyType" minOccurs="0" maxOccurs="1"/>
    <element name="publiziertab" minOccurs="0" type="string"/>
    <element name="publiziertbis" minOccurs="0" type="string"/>
    <element name="rechtsstatus" minOccurs="0" type="string"/>
    <element name="bemerkungen" minOccurs="0" type="string"/>
    <element name="typ_kommunal_code" minOccurs="0" type="string"/>
    <element name="typ_kommunal_bezeichnung" minOccurs="0" type="string"/>
    <element name="typ_kantonal_code" minOccurs="0" type="string"/>
    <element name="typ_kantonal_bezeichnung" minOccurs="0" type="string"/>
    <element name="hauptnutzung_code" minOccurs="0" type="integer"/>
    <element name="hauptnutzung_bezeichnung" minOccurs="0" type="string"/>
    <element name="kanton" minOccurs="0" type="string"/>
    <element name="dokument" minOccurs="0" type="string"/>
  </sequence></extension></complexContent>
</complexType>
```

**There is NO `ausnuetzungsziffer` / `nutzungsziffer`, NO `geschosszahl` / `vollgeschosse`, NO
`gebaeudehoehe` / `gesamthoehe` / `firsthoehe` element.** The layer carries zone *identification* and a
`dokument` string only.

### 1.2 — `GetFeature` `ms:grundnutzung` — actual populated values (canton AI)

`REQUEST=GetFeature&TYPENAMES=ms:grundnutzung&COUNT=2` (GML 3.2) → **HTTP 200**, `numberReturned="2"`,
verbatim feature 1:

```xml
<ms:rechtsstatus>inKraft</ms:rechtsstatus>
<ms:bemerkungen>W2</ms:bemerkungen>
<ms:typ_kommunal_code>1102</ms:typ_kommunal_code>
<ms:typ_kommunal_bezeichnung>Wohnzone</ms:typ_kommunal_bezeichnung>
<ms:typ_kantonal_code>1102</ms:typ_kantonal_code>
<ms:typ_kantonal_bezeichnung>Wohnzone</ms:typ_kantonal_bezeichnung>
<ms:hauptnutzung_code>11</ms:hauptnutzung_code>
<ms:hauptnutzung_bezeichnung>Wohnzonen</ms:hauptnutzung_bezeichnung>
<ms:kanton>AI</ms:kanton>
<ms:dokument>{"Dokumente":[{"Typ":null,"Titel":null,"Link":null,"Abkuerzung":null,
   "OffizielleNr":null,"NurInGemeinde":null,...}]}</ms:dokument>
```

Reading: the parcel's zone is **fully identified** — `W2` (the local abbreviation in `bemerkungen`),
`Wohnzone` (residential), national main-use `11 / Wohnzonen`. But the *number* `W2` implies (its
Ausnützungsziffer, its permitted `Vollgeschosse`, its `Gebäudehöhe`) is **absent** — and in this canton
the `dokument.Link` that would point to the Baureglement is itself **null**. (Second feature: identical
shape, `1201 / Gewerbe- und Industriezone`, `hauptnutzung 12 / Arbeitszonen`, dokument null.)

`outputFormat=application/json` is rejected for this layer (`'application/json' is not a permitted output
format for layer 'grundnutzung'`) — GML is the transport; not material to the verdict.

### 1.3 — The area-overlay layer (where height *might* have lived)

`DescribeFeatureType&TYPENAMES=ms:ueberlagernde_nutzungsplaninhalte_flaechenbezogene_festlegungen` →
**HTTP 200**, schema is **byte-for-byte the same generic set** as `grundnutzung` (geometry,
publiziertab/bis, rechtsstatus, bemerkungen, typ_kommunal/kantonal code+bezeichnung, hauptnutzung
code+bezeichnung, kanton, dokument). **No height attribute in the overlay layer either.** The prior
hypothesis "max height may be an attribute of the overlay WFS layer" is **disproven**.

---

## 2 — The `wrong-system` cross-check: the federal INTERLIS model (MEMORY §probe-can-be-wrong-three-ways)

A MapServer `DescribeFeatureType` only shows what the *mapfile* publishes. Before recording "not
structured", I checked the **canonical federal model** the WFS is derived from — the authority on what
the number *could* be — to avoid a wrong-property / wrong-system false negative.

**`https://models.geo.admin.ch/ARE/Nutzungsplanung_V1_2.ili`** → HTTP 200, 226 lines. Verbatim:

```interlis
CLASS Typ =
  Code : MANDATORY TEXT*40;
  Bezeichnung : MANDATORY TEXT*80;
  Abkuerzung : TEXT*12;
  Verbindlichkeit : MANDATORY Nutzungsplanung_V1_2.Verbindlichkeit;
  Nutzungsziffer : 0.00 .. 9.00;          -- ← the FAR/plot-ratio slot, OPTIONAL
  Nutzungsziffer_Art : TEXT*40;           -- ← which ratio (AZ / GFZ / BMZ / GRZ …), OPTIONAL
  Bemerkungen : MTEXT;
  Symbol : BLACKBOX BINARY;
END Typ;

CLASS Grundnutzung_Zonenflaeche EXTENDS Geometrie =    -- the zone POLYGON: geometry + status only
  Geometrie : MANDATORY Nutzungsplanung_V1_2.Einzelflaeche;
END Grundnutzung_Zonenflaeche;

ASSOCIATION Typ_Geometrie =
  Geometrie -- {0..*} Geometrie;
  Typ -<> {1} Typ;      -- each zone polygon references EXACTLY ONE Typ (aggregation)
END Typ_Geometrie;
```

**Three findings that make the verdict precise, not a flat "no":**

1. **The federal model DOES have a typed FAR slot.** `Typ.Nutzungsziffer : 0.00 .. 9.00` +
   `Nutzungsziffer_Art` — reachable from any zone polygon via the mandatory `Typ_Geometrie` association.
   This is a *native structured number*, not prose. It is the single thing that puts Switzerland's
   **ceiling** above France's (where the number exists only as règlement text).
2. **…but it is OPTIONAL** (no `MANDATORY`), so canton/commune population is not guaranteed — and the
   **national geodienste WFS flattening does not surface it at all** (§1.1). Getting it means harvesting
   each canton's own INTERLIS `Typ` catalogue, not one national call.
3. **Height / floor count exist NOWHERE in the model.** Grep of the whole `.ili` for
   `hoehe|höhe|geschoss|vollgeschoss|firsth|traufh` → the ONLY hits are the two `Nutzungsziffer`
   lines. There is **no `Gebäudehöhe`, no `Firsthöhe`, no `Vollgeschosse`** anywhere. Max height and
   floor count are genuinely Baureglement-PDF-bound — same as France for height.

### Why 88%-as-numeric-fill fails, stated exactly

- Zone-ID: **structured, strong** (national WFS + ÖREB `TypeCode`), ~70% of the way there.
- FAR (Nutzungsziffer): a **typed model slot that the national delivery does not populate/expose** →
  ~0–10% delivered today; a per-canton INTERLIS harvest could raise it (a *data* project, not OCR).
- Height / setback: **not modelled at all** → PDF-bound, ~0–5%.
- Full 3-field (zone + density + height, no PDF): **~20–25%**, dominated by height never being data.

---

## 3 — The three unfinished content probes

### 3.1 — GWR building record, field-by-field (DONE — real values)

`GET https://madd.bfs.admin.ch/eCH-0206?egid=1175237&requestContext=building` → **HTTP 200**,
eCH-0206 XML. Verbatim (EGID 1175237, Poschiavo, GR):

| eCH-0206 element | GWR field | Value | Meaning |
|---|---|---|---|
| `EGID` | EGID | `1175237` | federal building id |
| `buildingCategory` | GKAT | `1020` | building category |
| `buildingClass` | GKLAS | `1110` | building class (detached single-dwelling, per GKLAS domain) |
| `dateOfConstruction` | GBAUJ | `1987` | construction year |
| `surfaceAreaOfBuilding` | GAREA | `87` | footprint area (m²) |
| `numberOfFloors` | GASTW | `3` | **storey count** |
| `buildingStatus` | GSTAT | `1004` | existing/in-use |
| `municipalityId` / `municipalityName` / `cantonAbbreviation` | GGDENR / GDENAME / GDEKT | `3561` / `Poschiavo` / `GR` | location |

⇒ GWR gives **per-building storeys, footprint area, year, class as structured integers** — a strong,
national, keyless **context / verification** layer (not a *rule*: it says how many floors a building HAS,
not how many the zone ALLOWS). eCH-0206 uses semantic English element names that map 1:1 to GWR codes.
(Second EGID 501001, Heiden AR, prior pass: 5 dwellings — consistent.)

### 3.2 — swissBUILDINGS3D CityGML / STAC (DONE)

`https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissbuildings3d_3_0` → **HTTP 200**.
Collection `swissBUILDINGS3D 3.0 Beta`, `proj:epsg 2056`, `geoadmin:variant ["tiled","fullcoverage"]`,
spatial bbox `[5.22,45.32,11.26,48.24]` (CH+FL), temporal to `2026-06-01`, updated `2026-06-04`,
`items` endpoint live.

`…/items?limit=3` → tile items `swissbuildings3d_3_0_2013_<tile>-<n>_2056_5728.*`; **assets per tile are
`application/x.filegdb+zip` (`.gdb.zip`) and `application/x.dwg+zip` (`.dwg.zip`)**. Tile grid is the
swisstopo 1×1 km LV95 scheme (EPSG:2056).

⚠ **Nuance:** the main STAC collection ships **FileGDB + DWG per tile — CityGML 2.0 is NOT a STAC asset
here.** CityGML 2.0 is a **separate curated download** (swisstopo CityGML product page, confirmed prior,
smaller canton subset). So the 3D-context massing source = swissBUILDINGS3D 3.0 Beta GDB/DWG tiles via
STAC (parallel to the Barcelona tile pipeline), with CityGML 2.0 as an alternate export for a subset.

### 3.3 — ÖREB extract CONTENT (ATTEMPTED — not landed; answered more authoritatively elsewhere)

Goal: fetch one canton's full ÖREB extract and inspect the land-use-plan restriction content (does any
canton put AZ/height in the `Information` key-value array?). Attempts, all this origin, 2026-07-24:

| URL | Result |
|---|---|
| `api.geo.ag.ch/v2/oereb/getegrid/json/?EN=2645020,1249500` | ✅ prior — `CH959823775233` |
| `api.geo.ag.ch/v2/oereb/capabilities/json/` | ✅ HTTP 200 — topic list: `ch.Nutzungsplanung`, `ch.ProjektierungszonenNationalstrassen`, `ch.Baulinien…` |
| `api.geo.ag.ch/v2/oereb/extract/reduced/json/?EGRID=…` | ❌ 404 |
| `api.geo.ag.ch/v2/oereb/extract/reduced/xml/?EGRID=…` | ❌ 404 |
| `api.geo.ag.ch/v2/oereb/extract/reduced/json/geometry/?EGRID=…` | ❌ 404 |
| `maps.zh.ch/oereb/v2/extract/reduced/{json,xml,pdf}/?EGRID=CH779170199926` | ❌ 404 "Dokument nicht auffindbar" |
| `api.oereb.bs.ch/extract/reduced/json/?EGRID=…` | ❌ 303 → error page |

The full `extract` operation needs **per-canton path discovery** (each ÖREB implementation exposes the
extract at a slightly different route/params; some require a signed/POST request). `getegrid` works
everywhere; the extract does not respond to the federal-spec guesses. **This is the same wall the prior
pass hit** and is a genuine open item — BUT the question it was meant to answer is now settled more
authoritatively:

- The **ÖREB 2.0 JSON schema** (`schemas.geo.admin.ch/V_D/OeREB/2.0/extractdata.json`, prior-confirmed)
  defines `RestrictionOnLandownership` = `TypeCode` (structured zone code) + `LegalProvisions[].TextAtWeb`
  (PDF URL) + `Information` (optional key-value). **There is no numeric FAR/height field in the schema** —
  so even a fetched extract cannot carry a *typed* AZ/height; at most a canton could stuff a value into
  the free-text `Information` array, which is not a reliable structured field.
- The **WFS + INTERLIS model** (§1–2) already prove the density is not in the national structured
  delivery and height is not modelled. The ÖREB extract cannot over-rule its own schema.

So the ÖREB-extract-content probe stays `ATTEMPTED` for the record, but it is **not decision-relevant**:
the verdict rests on the WFS schema+data and the INTERLIS model, which are conclusive.

---

## 4 — Endpoint probe ledger (this spike, 2026-07-24)

| Endpoint / artifact | Request | Result |
|---|---|---|
| geodienste WFS `ms:grundnutzung` | DescribeFeatureType | ✅ 200 — 13 elements, **no numeric density/height** |
| geodienste WFS `ms:grundnutzung` | GetFeature COUNT=2 (GML) | ✅ 200 — zone-ID populated (`W2/Wohnzone/11`), dokument null |
| geodienste WFS overlay `…flaechenbezogene…` | DescribeFeatureType | ✅ 200 — identical generic schema, **no height** |
| `models.geo.admin.ch/ARE/Nutzungsplanung_V1_2.ili` | GET | ✅ 200 — `Typ.Nutzungsziffer 0..9` (optional); **no height class anywhere** |
| `madd.bfs.admin.ch/eCH-0206?egid=1175237` | GET | ✅ 200 — GKAT 1020, GKLAS 1110, GBAUJ 1987, GAREA 87, GASTW 3, Poschiavo GR |
| STAC `ch.swisstopo.swissbuildings3d_3_0` | GET collection + items | ✅ 200 — EPSG 2056, tiled/fullcoverage, assets `.gdb.zip` + `.dwg.zip` |
| `api.geo.ag.ch/v2/oereb/capabilities/json/` | GET | ✅ 200 — ÖREB topic list |
| ÖREB extract (AG/ZH/BS, json/xml/pdf) | GET | ❌ 404/303 — per-canton path not landed |

**Origin note:** every probe above succeeded from a **non-DACH** egress. The earlier "geo-blocked"
status applied to ZG's *cantonal* WFS host, not to `geodienste.ch` or the federal `*.admin.ch` services.
The deciding probe is therefore **not** blocked by IP and this verdict is solid, not provisional.

---

## 5 — What this means for build (see RATE-IMPLEMENTATION-PLAN §Phase 0b)

- **Do NOT scaffold a numeric `ChZoningProvider` today.** The deciding probe did not confirm structured
  numbers via any national endpoint (FAR unexposed + optional; height unmodelled). Per the build gate,
  Outcome B ⇒ document the France-style path, not a numeric provider.
- **The one real structured win is zone identification.** A future `ChZoningProvider` could return zone
  code/label/main-use from the geodienste WFS as `structured`, with FAR/height `null` (→ `estimated-ruleset`
  fallback), gated behind L-449 — the Madrid/Córdoba "registered-but-refuses-numbers" shape. That is a
  separate, smaller scope than a numeric provider and is **not** authorised by this probe alone.
- **The highest-leverage next step is a per-canton `Typ`-catalogue harvest**, not OCR: because the FAR is
  a typed model slot, a canton that publishes its populated `Typ` catalogue (INTERLIS/ili2pg) yields
  structured AZ **as data**. That is Switzerland's genuine ceiling advantage over France — a data-plumbing
  job, not a prose-extraction job. Height/setback still need the Baureglement pipeline (Outcome-B, L-449).
