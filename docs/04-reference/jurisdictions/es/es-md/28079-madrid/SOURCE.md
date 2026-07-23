# SOURCE — Madrid (INE 28079, Comunidad de Madrid, ES-MD)

**The data-source catalogue for Madrid** — every source behind a Madrid answer, per JURISDICTION-PLAYBOOK §3.3b. This is the human face of the attribution the parcel layer carries; the parcel-selection panel surfaces the same facts (L-612). Last updated 2026-07-23.

| Source | Provides | Endpoint / locator | Access | Tier | Licence / attribution | Currency | Notes |
|---|---|---|---|---|---|---|---|
| **Ayuntamiento de Madrid — sigma ArcGIS, `PG_CONDICIONES_EDIFICACION/6`** | Norma Zonal 1 buildable footprint **ring** + `COEF_Z` edificabilidad, per manzana | `https://sigma.madrid.es/…/PGOUM97/PG_CONDICIONES_EDIFICACION/MapServer/6` (single-ring polygon, EPSG:25830) | live ArcGIS REST, free-keyless | **VERIFIED-LIVE** (2026-07-23) | © Ayuntamiento de Madrid | PGOUM-97, living | ⚠ `COEF_Z` is a **coded String** (`"-"`,`"4"`,`"5"`,`"0 / 5"`), not a float — parse defensively; `"0 / 5"` must be refused, never coerced to 0. Layer **6** is the closed ring (no polyline-closing needed). |
| **sigma ArcGIS, `PG_CONDICIONES_EDIFICACION/2`** | NZ1 `Fondo de la Edificación` (buildable-depth polyline) | same service, layer 2 | live ArcGIS REST, free | **VERIFIED-LIVE** | © Ayuntamiento de Madrid | PGOUM-97 | The alignment reference; the ring (layer 6) is the primary. |
| **sigma ArcGIS, `PG_ORDENACION`** | calificación / the **Norma Zonal code** per parcel (needed to route NZ) | `…/PGOUM97/PG_ORDENACION/MapServer` | live ArcGIS REST | **COULD-NOT-VERIFY** | © Ayuntamiento de Madrid | — | ⚠ Returned **`Service not started`** across two live passes — the NZ-code service is DOWN. Re-verify before registration; the NZ routing depends on it. |
| **Compendio de las NNUU del PGOUM-97 (2023 consolidated)** | The **Norma Zonal parameters** (NZ 3/4/5/7/8: fondo, altura/plantas via Art. 8.9.10, retranqueos, ocupación, usos) | the Ayuntamiento normativa portal PDF | document, **>10 MB (unfetchable by agent)** | **VERIFIED-PRIMARY (exists), values UN-TRANSCRIBED** | © Ayuntamiento de Madrid | 2023 consolidation | 🔴 The NZ 4/8 values are **document-gated** — needs a human read of Cap. 8.x. NZ4 altura is a **construction** (street-width × plantas), needs a resolver, not a scalar. |
| **Sede Electrónica del Catastro (DGC)** | parcel boundary geometry (national) | `https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx` (WFS) + the RC coordinate service | live WFS, free-keyless | **VERIFIED-LIVE** | Dirección General del Catastro | current | Same national parcel source used across all Spanish cities. |
| **National SIU (MITMA/MIVAU)** | land **clasificación** (`OGC_Clases_Suelo`) + a per-municipality **planeamiento registry** (Madrid = PGOUM-97) | `https://mapas.fomento.gob.es/arcgis/rest/services/SIU/…` (browser-UA required) | live ArcGIS REST, free | **VERIFIED-LIVE** | © MITMA/MIVAU | current | ⚠ **No national *calificación* service exists** (proven, Córdoba L-609) — SIU serves classification + the plan registry, never the zoning that drives the envelope. Default `curl` gets 403; needs a browser UA. |

## Status of Madrid answers today
- **Shippable envelopes: ≈ 0%** — NZ1 is engine-unblocked (the reusable `explicit-area` solver shipped) and provider-adapted (`esMadridNZ1Provider.ts`), but wiring-gated (needs the same-origin proxy to sigma layers 6+1 + the NZ-code re-verify + L-449 sign-off); NZ 4/8/5/7 are document-gated.
- **Ceiling once wired + sourced: ≈ 60–62%** (0.65 directly-NZ-governed × 0.96 in NZ 3/4/1/8).
- **Corpus shape:** ⭐ **shape-B / DATA** — Madrid publishes the buildable footprint *as geometry* and edificabilidad *as an attribute*. Not a Barcelona-style drawing problem. The wall is (a) the NZ-code service being down and (b) the NZ 4/8 document read.

## Dead ends (measured — do not re-run)
- `PG_ORDENACION` (`Service not started`, ×2 passes) — the calificación/NZ-code plane is down.
- The Compendio 2023 PDF via WebFetch — exceeds the 10 MB fetch limit.
- National SIU as a calificación source — it has none (per-jurisdiction only).

**See also:** `sources/SOURCES.md` (per-field legal citations, the trust gate) · `sources/VERIFICATION.md` · `findings/L-608-*` · `NEXT.md`.
