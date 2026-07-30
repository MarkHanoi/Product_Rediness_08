# Zürich (canton ZH / City of Zürich, BFS-Nr 261) — BZO Data Probe

**Dated:** 2026-07-25 · **Probe origin:** US-region egress (WebFetch) · **Reference point:** 47.377, 8.540 (Zürich HB)
**Status:** DONE. Verdict recorded below with verbatim evidence.

> The national recon (`../../findings/SWITZERLAND-DATA-RECON-SPIKE.md`, 2026-07-24) settled **Outcome B**
> for the *national* Nutzungsplanung WFS and named the **per-canton harvest** as the open, highest-leverage
> question. This probe resolves that question for the reference commune — the **City of Zürich**, the best-
> provisioned open GIS in CH (the Swiss analogue of Barcelona) — by probing the cantonal AV cadastre and the
> City of Zürich BZO WFS directly. It decides whether Zürich flips from bare refusal to a real computed
> envelope, or to an honest cited-refusal upgrade.

---

## 0 — VERDICT

**Outcome B holds even for the City of Zürich.** The three legs:

| Leg | Result | Confidence |
|---|---|---|
| **Parcel geometry** | ✅ **Structured, queryable, reachable** — `maps.zh.ch/wfs/AVZHWFS`, layer `liegenschaften_f`, EPSG:2056 | real ring returned |
| **Zone identity** | ✅ **Structured, queryable, reachable, FINER than national** — City of Zürich BZO WFS `bzo_zone_v`: municipal `typ` code + a DIRECT per-parcel ordinance link | real values returned |
| **The rules (AZ / Vollgeschosse / Gebäudehöhe)** | ❌ **NOT structured** — no numeric field in `bzo_zone_v` nor `bzo_zone_erhoehte_az_v`; PDF-bound in BZO 700.100 Bauordnung | `DescribeFeatureType` proof |

⇒ **`CH_FAR_CERTIFIED` stays OFF.** The honest build is the Madrid/DK cited-refusal upgrade: real parcel +
richer municipal zone identity (`typ` + the BZO ordinance URL) + a refusal that NAMES the per-parcel BZO
document. NO Ausnützungsziffer / height is fabricated. Flipping the gate needs a human-verified transcription
of the BZO 700.100 zone→AZ/Vollgeschosse table (§4 founder prompt).

---

## 1 — Parcel geometry (leg a)

**Endpoint:** `https://maps.zh.ch/wfs/AVZHWFS` (WFS 1.1.0, canton ZH Amtliche Vermessung, DM01AVZH). **Reachable
from US egress — NOT geo-blocked** (contrast the national recon's geo-blocked *ZG* cantonal WFS).

- `GetCapabilities` → parcel feature type **`liegenschaften_f`**, `DefaultSRS urn:ogc:def:crs:EPSG::2056` (LV95).
- `GetFeature&TYPENAME=liegenschaften_f&BBOX=2683250,1247150,2683400,1247300,EPSG:2056&MAXFEATURES=1` → **HTTP 200,
  one parcel**, verbatim attributes:

  | field | value |
  |---|---|
  | `nummer` | `AA5070` |
  | `egris_egrid` | `CH349199778779` |
  | `flaechenmass` | `750` (m²) |
  | `bfsnr` | `261` (City of Zürich) |
  | `nbident` | `ZH0200000261` |
  | `vollstaendigkeit` | `Vollstaendig` |
  | `bearbeitungsdatum` | `01.01.1994` |

  Geometry: a `MultiSurface` polygon, **184-vertex exterior ring** in EPSG:2056, opening/closing at
  `2683310.347 1247183.883`. ⇒ a real, closed parcel ring is returned at the reference point in native LV95;
  reprojection to WGS84 is a downstream concern (the parcel providers already reproject).

---

## 2 — Zone identity (leg b) — the City of Zürich BZO WFS

**Endpoint:** `https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Nutzungsplanung___kommunale_Bau__und_Zonenordnung__BZO_`
(WFS 1.1.0, QGIS Server). GeoJSON (WGS84) + GeoPackage/Shape/DXF also published. **Reachable from US egress.**

- `GetCapabilities` → 56 feature types incl. `bzo_zone_v` (base zones), `bzo_zone_erhoehte_az_v` (elevated-AZ
  areas), `bzo_kernzone_v`, `bzo_hochhausgebiet_v`, `bzo_zone_wohnanteil_v`, `bzo_zone_ffz_v`, …
- `DescribeFeatureType&TYPENAME=bzo_zone_v` → elements (verbatim): `geometry`, `geometrie_gdo` (string),
  `rechtsstatus` (string), `mutationsnummer` (string), **`typ` (string)**, `plan_url` (string),
  **`rechtsvorschrift_url` (string)**, `objectid` (int).
- `GetFeature&TYPENAME=bzo_zone_v&MAXFEATURES=2` → verbatim feature 1:

  ```xml
  <qgs:bzo_zone_v gml:id="bzo_zone_v.1">
    <qgs:rechtsstatus>inKraft</qgs:rechtsstatus>
    <qgs:typ>E1</qgs:typ>
    <qgs:rechtsvorschrift_url>https://oerebdocs.zh.ch/getDoc?docid=573</qgs:rechtsvorschrift_url>
    <qgs:objectid>1</qgs:objectid>
  </qgs:bzo_zone_v>
  ```

- `MAXFEATURES=60&PROPERTYNAME=typ` → distinct `typ` values incl. `E1`, **`W2bIII`**, `Oe5`, `NZ`. The `typ`
  code is MUNICIPAL and finer than the national `typ_kommunal_code`; the residential codes **encode the
  Vollgeschosse in the Roman-numeral suffix** (`W2bIII`) — a *signal*, not a height we may cite.

**Reading:** the city BZO WFS gives a genuinely richer zone-ID than the national `ms:grundnutzung` — a municipal
`typ` code AND a DIRECT `rechtsvorschrift_url` to *this parcel's* governing ordinance (many cantons leave the
national `dokument` null). That is the structured half PRYZM renders.

---

## 3 — THE CRUX (leg c): the rules are NOT structured — PDF-bound in BZO 700.100

- `DescribeFeatureType&TYPENAME=bzo_zone_v` carries **NO** `ausnuetzungsziffer`/`az`, **NO** `vollgeschosse`,
  **NO** `gebaeudehoehe`, **NO** `baumassenziffer` — only `typ` + `rechtsvorschrift_url` (§2).
- The dedicated **`bzo_zone_erhoehte_az_v`** ("Gebiete mit erhöhter Ausnützung") layer, where a number might
  have lived, is `DescribeFeatureType` → `geometry`, `geometrie_gdo` (string), `rechtsstatus` (string),
  **`bemerkungen` (string)**, `objectid` (int). **No numeric AZ field** — the elevated-AZ areas carry only a
  free-text remark, not a machine-readable ratio.
- Independent cross-check (the commune's published ordinance): the Ausnützungsziffer per zone code is stated in
  **`700.100 Bau- und Zonenordnung der Stadt Zürich (BZO 2016)`** — the very document the WFS links per-polygon
  via `rechtsvorschrift_url`. Published magnitudes (Stadt Zürich BZO summary): centre zones **Z5–Z7 max AZ
  200–260 %**, other zones **~65–170 %** — i.e. a per-zone-code TABLE in the ordinance text, not a WFS attribute.

⇒ The AZ / height / Vollgeschosse are **model+PDF-bound**, keyed by the `typ` code — exactly the national
Outcome-B shape, one level down. Recoverable only as a **human-verified transcription of the BZO 700.100 zone
table** (the L-449 gate). PRYZM must NOT fabricate them (§CONTEXT-DATA-HONESTY; probe-can-be-wrong-three-ways).

---

## 4 — Founder prompt (what a human must fetch + verify to flip `CH_FAR_CERTIFIED` for Zürich)

To turn the Zürich refusal into a real computed envelope (Barcelona-parity), a human must, ONCE:

1. **Fetch** `700.100 Bau- und Zonenordnung der Stadt Zürich (BZO 2016)` — the per-polygon
   `rechtsvorschrift_url` links it (e.g. `https://oerebdocs.zh.ch/getDoc?docid=573`); the consolidated PDF is on
   the Stadt Zürich Amtliche Sammlung (700.100).
2. **Transcribe** the zone table: for each BZO `typ` code observed in `bzo_zone_v` (the residential `W2…W5`
   family incl. the `a/b` + Roman-`Vollgeschosse` suffixes, the centre zones `Z5–Z7`, `Q`, `K`, `Zk`), record
   the article's **Ausnützungsziffer (AZ, %)**, **max Gebäudehöhe (m)** and/or **Vollgeschosse**, and the
   Freiflächen-/Grünflächenziffer where it governs coverage. Keep the `farKind` (AZ vs BMZ) with every number.
3. **Cross-check** each transcribed number against a SECOND source (the BZO summary table / the GIS-Browser
   attribute popup) — an INDEPENDENT confirmation, per the probe discipline.
4. **Sign** `ch/sources/VERIFICATION.md` for Zürich and land the table as a curated catalogue keyed by `typ`,
   registered exactly like `CH_CANTON_FAR_CATALOGUES` (canton `ZH`) in `resolveChFarFromCantonCatalogue.ts`.
   Then flip `CH_FAR_CERTIFIED` (or a per-commune allow-list) and the CH path can compute an
   `estimated-ruleset` envelope (AZ × parcel area → GFA → floors via the Vollgeschosse code → height).

**Also required (server scope, out of this agent's remit):** wire the same-origin proxy `/api/ch/zurich-bzo`
(forwards a point-BBOX `GetFeature` on `bzo_zone_v` to `ogd.stadt-zuerich.ch` and returns `{ gml }`) and add
its host to the CSP `connect-src`. Until then `resolveZurichBzoZone` resolves `endpoint-unreachable` and the CH
path falls through to the national resolver — a non-breaking staging state (the Madrid-proxy pattern).

---

## 5 — Endpoint probe ledger (2026-07-25)

| Endpoint | Request | Result |
|---|---|---|
| `maps.zh.ch/wfs/AVZHWFS` | GetCapabilities | ✅ 200 — `liegenschaften_f`, EPSG:2056 |
| `maps.zh.ch/wfs/AVZHWFS` | GetFeature liegenschaften_f BBOX (Zürich HB) | ✅ 200 — parcel `AA5070`, EGRID `CH349199778779`, 750 m², 184-vertex ring |
| `ogd.stadt-zuerich.ch/wfs/.../BZO_` | GetCapabilities | ✅ 200 — 56 types incl. `bzo_zone_v`, `bzo_zone_erhoehte_az_v` |
| same | DescribeFeatureType `bzo_zone_v` | ✅ 200 — `typ`, `rechtsstatus`, `rechtsvorschrift_url`, `objectid`; **no numeric field** |
| same | DescribeFeatureType `bzo_zone_erhoehte_az_v` | ✅ 200 — `bemerkungen` (string) only; **no numeric AZ** |
| same | GetFeature `bzo_zone_v` | ✅ 200 — `typ E1`, `inKraft`, `rechtsvorschrift_url docid=573`; distinct `typ` incl. `W2bIII`, `Oe5`, `NZ` |

**Origin note:** both `maps.zh.ch` and `ogd.stadt-zuerich.ch` answered from US egress (not geo-blocked). Verdict
is solid, not provisional.
