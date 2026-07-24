# Norway — parks, green space, and trees

**Last updated:** 2026-07-24 · **Status:** RESEARCH OUTLINE — sources identified; no live probe run

---

## National green space data sources

| Source | Content | Access | Licence | Status |
|---|---|---|---|---|
| **FKB-AR5** (Arealdekke, Nibio) | National land-cover classification at 1:5000; includes: fulldyrka mark, overflatedyrka mark, innmarksbeite, skog (forest), myr (bog), åpen fastmark, bebygd areal, vann | Free download via Nibio (Norsk institutt for bioøkonomi); WMS also available | Open | Confirmed published; endpoint not yet probed |
| **FKB-Grøntanlegg** | Formal green spaces and parks (Felles KartBase) | Norge digitalt parties: free; commercial: same licence gate as FKB-Bygning | Norge digitalt / Geovekst | Licence-gated for commercial use |
| **OSM Norway** | Parks, forests, grass areas — community-maintained; Norway OSM community is active | Free, ODbL | ODbL | Live alternative for non-Norge-digitalt entities |
| **Miljødirektoratet naturdata** | Protected nature areas (naturreservat, nasjonalpark, Natura 2000 etc.) | Free via `miljodirektoratet.no` and Geonorge | Open | Published |

---

## Reguleringsplan green-space zones

Within reguleringsplaner, green space and park areas are encoded using SOSI Plan arealformål codes:

| Code | Meaning |
|---|---|
| `3010` | Grønnstruktur (green structure) |
| `3020` | Naturområde (nature area) |
| `3030` | Turdrag (recreation corridor) |
| `3040` | Friområde (public open space) |

These codes appear as structured attributes in any SOSI Plan-compliant planregister WFS — a national advantage over France and Germany where equivalent green-space designations are not nationally standardised in the base plan data format.

---

## MUA — minste uteoppholdsareal

Norway's TEK17 § 5-6 defines **MUA (minste uteoppholdsareal)** — minimum outdoor amenity area — as a nationally standardised green-space requirement that may appear in reguleringsbestemmelser alongside %-BYA/BRA values. MUA is a per-project calculation method defined nationally; the actual m² value required per project is set per plan.

---

## Tree registers

Norway does not have a confirmed national street-tree register equivalent to some European cities. Individual kommuner (notably Oslo) maintain their own tree registers. Oslo's tree register is not confirmed as an open API dataset in this pass — check Oslo open-data catalogue.
