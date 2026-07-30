<!-- COUNTRY-RATE.md — Spain composite completion roll-up (C63 §5). Country composite master
     ("master RATE" at the country level, L-649): one row per tackled city, columns = the 7 axes +
     overall. Naming per _TEMPLATE/NAMING-CONVENTION.md. Every cell is COMPUTED (cited-derived) or
     `not-assessed`; the national legislation number lives in RATE.md (legacy) — do NOT confuse it
     with this composite. This file was authored by the C63 Phase-1 audit; a future scorecard-function
     re-run replaces the manual cells (C63 §1.1/§8.1). -->
# Spain (es) — Country RATE (master completion roll-up)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — cheap axes (DATA-SOURCES · TERRAIN · CONTEXT)
     cited-derived per C63 §8.1; all others `not-assessed` with a typed C62 reason. No fabricated cell. -->

**National legislation/data-fill (`LEGISLATION-RATE.md` equivalent):** the legacy national structured-fill
number is `~34 %` — see [`RATE.md`](./RATE.md) (NOT YET renamed `LEGISLATION-RATE.md`; pending the L-649
migration, owned by governance). See [`README.md`](./README.md) for the national data layer.

> Authority: [C63](../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Axes fixed in C63 §3.
> Weighting = `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). Every cell is
> cited-derived or `not-assessed`; NEVER a hand-typed/borrowed number (C63 §1.1/§1.2).

**Legend.** `—` = **not-assessed** (a typed C62 UnknownReason lives in the city's `RATE.md`; `—` ≠ 0 %,
C63 §1.2). `(cap)` = HEIGHTS measured-**capable** (MDS ready-bbox) but unbaked → still not-assessed.
`(out)` = CONTEXT `outside-coverage` (outside the `bake.mjs` `spain` clip bbox). `⚑` = FORAL cadastre
(national Catastro does not serve it). **Overall** is renormalised over the ASSESSED subset only (`partial`).

## §A — Per-city completion matrix (49 SCAFFOLDED this pass — provincial capitals)

Cheap axes cited-derived (see each city's `RATE.md` for the full derivation); PARCEL/LEGISLATION/ENVELOPE/
HEIGHTS are the human-gated axes, honestly `not-assessed` until sourced.

| City (`INE`) | PARCEL | LEGIS­LATION | DATA-SRC | ENVELOPE | TERRAIN | HEIGHTS/LOD | CONTEXT | **Overall** | Dossier |
|---|---|---|---|---|---|---|---|---|---|
| _Andalucía (es-an)_ | | | | | | | | | |
| Almería (`04013`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-an/04013-almeria/RATE.md) |
| Cádiz (`11012`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-an/11012-cadiz/RATE.md) |
| Granada (`18087`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-an/18087-granada/RATE.md) |
| Huelva (`21041`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-an/21041-huelva/RATE.md) |
| Jaén (`23050`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-an/23050-jaen/RATE.md) |
| Málaga (`29067`) | `—` | `—` | **70%** | `—` | **50%** | `—`(cap) | **56%** | **61%** `partial` | [dossier](./es-an/29067-malaga/RATE.md) |
| Sevilla (`41091`) | `—` | `—` | **70%** | `—` | **50%** | `—`(cap) | **56%** | **61%** `partial` | [dossier](./es-an/41091-sevilla/RATE.md) |
| _Aragón (es-ar)_ | | | | | | | | | |
| Huesca (`22125`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-ar/22125-huesca/RATE.md) |
| Teruel (`44216`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-ar/44216-teruel/RATE.md) |
| Zaragoza (`50297`) | `—` | `—` | **70%** | `—` | **50%** | `—`(cap) | **56%** | **61%** `partial` | [dossier](./es-ar/50297-zaragoza/RATE.md) |
| _Asturias (es-as)_ | | | | | | | | | |
| Oviedo (`33044`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-as/33044-oviedo/RATE.md) |
| _Illes Balears (es-ib)_ | | | | | | | | | |
| Palma (`07040`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-ib/07040-palma/RATE.md) |
| _Cantabria (es-cb)_ | | | | | | | | | |
| Santander (`39075`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-cb/39075-santander/RATE.md) |
| _Castilla y León (es-cl)_ | | | | | | | | | |
| Ávila (`05019`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-cl/05019-avila/RATE.md) |
| Burgos (`09059`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-cl/09059-burgos/RATE.md) |
| León (`24089`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-cl/24089-leon/RATE.md) |
| Palencia (`34120`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-cl/34120-palencia/RATE.md) |
| Salamanca (`37274`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-cl/37274-salamanca/RATE.md) |
| Segovia (`40194`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-cl/40194-segovia/RATE.md) |
| Soria (`42173`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-cl/42173-soria/RATE.md) |
| Valladolid (`47186`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-cl/47186-valladolid/RATE.md) |
| Zamora (`49275`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-cl/49275-zamora/RATE.md) |
| _Castilla-La Mancha (es-cm)_ | | | | | | | | | |
| Albacete (`02003`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-cm/02003-albacete/RATE.md) |
| Ciudad Real (`13034`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-cm/13034-ciudad-real/RATE.md) |
| Cuenca (`16078`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-cm/16078-cuenca/RATE.md) |
| Guadalajara (`19130`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-cm/19130-guadalajara/RATE.md) |
| Toledo (`45168`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-cm/45168-toledo/RATE.md) |
| _Canarias (es-cn)_ | | | | | | | | | |
| Las Palmas de Gran Canaria (`35016`) | `—` | `—` | **50%** | `—` | **50%** | `—` | `—`(out) | **50%** `partial` | [dossier](./es-cn/35016-las-palmas-de-gran-canaria/RATE.md) |
| Santa Cruz de Tenerife (`38038`) | `—` | `—` | **50%** | `—` | **50%** | `—` | `—`(out) | **50%** `partial` | [dossier](./es-cn/38038-santa-cruz-de-tenerife/RATE.md) |
| _Cataluña (es-ct)_ | | | | | | | | | |
| Girona (`17079`) | `—` | `—` | **80%** | `—` | **50%** | `—` | **56%** | **66%** `partial` | [dossier](./es-ct/17079-girona/RATE.md) |
| Lleida (`25120`) | `—` | `—` | **80%** | `—` | **50%** | `—` | **56%** | **66%** `partial` | [dossier](./es-ct/25120-lleida/RATE.md) |
| Tarragona (`43148`) | `—` | `—` | **80%** | `—` | **50%** | `—` | **56%** | **66%** `partial` | [dossier](./es-ct/43148-tarragona/RATE.md) |
| _Extremadura (es-ex)_ | | | | | | | | | |
| Badajoz (`06015`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-ex/06015-badajoz/RATE.md) |
| Cáceres (`10037`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-ex/10037-caceres/RATE.md) |
| _Galicia (es-ga)_ | | | | | | | | | |
| A Coruña (`15030`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-ga/15030-a-coruna/RATE.md) |
| Lugo (`27028`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-ga/27028-lugo/RATE.md) |
| Ourense (`32054`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-ga/32054-ourense/RATE.md) |
| Pontevedra (`36038`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-ga/36038-pontevedra/RATE.md) |
| _Región de Murcia (es-mc)_ | | | | | | | | | |
| Murcia (`30030`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-mc/30030-murcia/RATE.md) |
| _Navarra (es-nc)_ | | | | | | | | | |
| Pamplona / Iruña (`31201`) ⚑ | `—` | `—` | **50%** | `—` | **50%** | `—` | **56%** | **51%** `partial` | [dossier](./es-nc/31201-pamplona/RATE.md) |
| _País Vasco (es-pv)_ | | | | | | | | | |
| Vitoria-Gasteiz (`01059`) ⚑ | `—` | `—` | **50%** | `—` | **50%** | `—` | **56%** | **51%** `partial` | [dossier](./es-pv/01059-vitoria-gasteiz/RATE.md) |
| Donostia / San Sebastián (`20069`) ⚑ | `—` | `—` | **50%** | `—` | **50%** | `—` | **56%** | **51%** `partial` | [dossier](./es-pv/20069-san-sebastian/RATE.md) |
| Bilbao (`48020`) ⚑ | `—` | `—` | **50%** | `—` | **50%** | `—`(cap) | **56%** | **51%** `partial` | [dossier](./es-pv/48020-bilbao/RATE.md) |
| _La Rioja (es-ri)_ | | | | | | | | | |
| Logroño (`26089`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-ri/26089-logrono/RATE.md) |
| _Comunitat Valenciana (es-vc)_ | | | | | | | | | |
| Alicante / Alacant (`03014`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-vc/03014-alicante/RATE.md) |
| Castelló de la Plana (`12040`) | `—` | `—` | **70%** | `—` | **50%** | `—` | **56%** | **61%** `partial` | [dossier](./es-vc/12040-castellon-de-la-plana/RATE.md) |
| València (`46250`) | `—` | `—` | **70%** | `—` | **50%** | `—`(cap) | **56%** | **61%** `partial` | [dossier](./es-vc/46250-valencia/RATE.md) |
| _Ceuta (es-ce)_ | | | | | | | | | |
| Ceuta (`51001`) | `—` | `—` | **50%** | `—` | **50%** | `—` | `—`(out) | **50%** `partial` | [dossier](./es-ce/51001-ceuta/RATE.md) |
| _Melilla (es-ml)_ | | | | | | | | | |
| Melilla (`52001`) | `—` | `—` | **50%** | `—` | **50%** | `—` | `—`(out) | **50%** `partial` | [dossier](./es-ml/52001-melilla/RATE.md) |

**Scaffolded totals (this pass):** 49 provincial-capital dossiers. Overall spread (assessed subset):
**66 %** ×3 (Catalan capitals — MUC zone-GIS lifts DATA-SOURCES), **61 %** ×38 (mainland/Balearic
capitals), **51 %** ×4 (foral: Bilbao, Vitoria-Gasteiz, San Sebastián, Pamplona — cadastre blocked),
**50 %** ×4 (Las Palmas, Santa Cruz de Tenerife, Ceuta, Melilla — CONTEXT outside the bake clip).
Of the 8 measured-height cities, **5 are in this pass** (Málaga, Sevilla, Zaragoza, València, Bilbao —
HEIGHTS `(cap)`); the other 3 (Barcelona, Madrid, Córdoba) pre-exist (§B).

## §B — Pre-existing dossiers (NOT re-scaffolded — C63 §1.7 "do not duplicate")

These have their own dossiers; their composite `RATE.md` (7-axis) is either present (capitals) or pending
the L-649 rename (Catalan munis carry `LEGISLATION-RATE.md`). Cells here are `see dossier` — the audit was
NOT re-run for them this pass (they hold rule-pack state the 49 scaffolds do not).

| City (`INE`) | Kind | Dossier | Note |
|---|---|---|---|
| Barcelona (`08019`) | capital | [dossier](./es-ct/08019-barcelona/RATE.md) | FULL rule pack (Ensanche/Nucli Antic/…), measured MDS heights confirmed, MUC zone-GIS. The pilot. |
| Madrid (`28079`) | capital | [dossier](./es-md/28079-madrid/RATE.md) | NZ-1 ring-only pack (esMadridNZ1), measured-capable heights. |
| Córdoba (`14021`) | capital | [dossier](./es-an/14021-cordoba/RATE.md) | PGOU-2001 pack + zone classification; measured MDS heights sampled (~17 m centro). |
| L'Hospitalet de Llobregat (`08101`) | wired muni | [dossier](./es-ct/08101-hospitalet/) | AMB wired; refusal gate (borrows no BCN numbers). |
| Badalona (`08015`) | wired muni | [dossier](./es-ct/08015-badalona/) | AMB wired; refusal gate. |
| Sant Boi de Llobregat (`08200`) | wired muni | [dossier](./es-ct/08200-sant-boi/) | AMB wired; refusal gate. |

## §C — Tackled but UNSCAFFOLDED (logged, never silently truncated — C63 SCALE clause)

- **Cornellà de Llobregat (`08073`, es-ct)** — WIRED muni (rulepack `esCornella.ts` + parcel bbox `cornellaBbox.ts`, refusal gate) — tackled per C63 §1.7 but has NO dossier folder. Needs the Badalona-style wired scaffold (refusal-gate ENVELOPE), not the terrain-only capital template.
- **Composite-RATE migration** for the 6 pre-existing dossiers (§B): Córdoba + Madrid carry a legacy
  `RATE.md` (old legislation number, not the 7-axis composite); the three AMB Catalan munis carry
  `LEGISLATION-RATE.md` but no composite `RATE.md` yet. Migrating them to the C63 composite is owned by
  the governance/migration track (out of this pass's write-fence).
- **Non-capital large municipalities** (Vigo 36057, Gijón 33024, and the ~260 other >10k-pop munis with a
  `terrain.mjs` row — §ES-ALL-MUNI L-636) are TACKLED for terrain but out of scope this pass (capitals
  first). They inherit the identical cheap-axis derivation; scaffold on demand.

## §D — Honesty ledger (per city: DOES / REFUSES / UNKNOWN · `honestyOk`)

Every scaffolded city has `honestyOk: true` — it fabricates nothing. One shared shape (the state is
uniform across the capitals), with the three deviations called out:

- **All 49 scaffolds** — DOES: terrain (PNOA MDT, rung-50 unverified) + national Catastro parcel routing +
  (inland) baked OSM context 5/9. REFUSES: an envelope (no rule pack) — never a borrowed/invented number.
  UNKNOWN (typed): PARCEL quality `not-queried`, LEGISLATION/ENVELOPE `pending-implementation`, HEIGHTS
  `not-queried`. `honestyOk: true`.
- **Foral 4** (Bilbao, Vitoria-Gasteiz, San Sebastián, Pamplona) — additionally: cadastre `blocked`
  (Basque/Navarra foral, `priority_318.csv` T3-FORAL-CADASTRE-BLOCKER); never presents an OSM footprint as a
  legal parcel.
- **Outside-clip 4** (Las Palmas, Santa Cruz de Tenerife, Ceuta, Melilla) — additionally: CONTEXT
  `outside-coverage`; never claims baked context it does not have.
- **Measured-5** (Málaga, Sevilla, Zaragoza, València, Bilbao) — HEIGHTS is measured-CAPABLE (MDS ready-bbox)
  but still `not-assessed` (unbaked) — capability is never reported as a measurement.

## Dossier index — the country-level files

| File | About | Feeds |
|---|---|---|
| **`COUNTRY-RATE.md`** (this) | per-city 7-axis roll-up — country composite master | rolls up all cities |
| [`RATE.md`](./RATE.md) | legacy national structured-fill (~34 %) — pending rename to `LEGISLATION-RATE.md` | LEGISLATION |
| [`LOD-RATE.md`](./LOD-RATE.md) | national building/terrain LOD sub-rate | HEIGHTS/LOD |
| [`README.md`](./README.md) | national data layer — priority tiers + live-verified regions | all |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | national climb | LEGISLATION (+all) |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authored under C63 audit L-649 Phase-1. INE codes cited
from `es/priority_318.csv`; axis state from `tools/context-bake/{bake,terrain,heightSources}.mjs` +
`packages/site-parcel-data/src/{parcelProviders,rulepacks}/registry.ts`.*
