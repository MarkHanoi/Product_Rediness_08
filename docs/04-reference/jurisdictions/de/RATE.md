# Data Readiness Rate — Germany (`de`) national

**Headline rate: ~28%**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [GRZ / GFZ] +
> height**) **without reading a B-Plan PDF or Satzung**. This definition is IDENTICAL across every
> jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany / France …) so the scores
> are directly comparable. Derived from direct endpoint/schema checks, not assumed from Germany's
> XPlanung reputation.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| Lyon Métropole | ~42% |
| Paris | ~35% |
| Norway (national) | ~32% |
| Hamburg | ~30% |
| **Germany (national)** | **~28%** |
| Berlin | ~28% |
| France (national) | ~22% |
| Munich / Marseille | ~18% |

Germany's national score sits above France (~22%) because the BauNVO §17 published ceiling table
is a genuine federal structured resource, and because XPlanung WFS infrastructure is live and open
in Hamburg and Berlin. It is held to ~28% because those WFS endpoints carry plan boundaries and PDF
links only — GRZ/GFZ/Höhe are absent from both confirmed schemas — and because the ~30% §34
"fit-the-neighbourhood" fraction of Germany yields no numeric answer by legal design.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry (ALKIS) | ⚠️ Per-Land | Schema standardised (AAA-Modell / AdV). Hamburg endpoint 404 confirmed; Berlin GDI-BE partly open; Bavaria TBD. NRW free. | ~55% (most Länder have ALKIS WFS; access terms and endpoints vary) |
| Regime classifier (§30 / §34 / §35) | ⚠️ Partial | Requires checking whether a B-Plan polygon covers the point (XPlanung WFS) + §34 interior / §35 outlying inference. WFS confirmed Hamburg and Berlin; Munich not yet found. | ~50% |
| BauNVO zone type (WA / GE / MK / etc.) | ✅ National lookup | BauNVO §§2–11 — fixed, closed national list identical in all 16 Länder. `WA` in Hamburg = `WA` in Munich = `WA` in Berlin. Readable from B-Plan WFS `inhalt` text field with NLP, or from B-Plan PDF. | ~40% (taxonomy known; attribution to a specific parcel requires the B-Plan PDF in most cases) |
| BauNVO §17 density orientation values | ✅ Published | `gesetze-im-internet.de/baunvo/__17.html` (VERIFIED LIVE 2026-07-24) — GRZ/GFZ/BMZ per zone type. Heading = **"Orientierungswerte für die Bestimmung des Maßes der baulichen Nutzung"** — orientation values for upper limits (may be exceeded with justification), **NOT** hard ceilings and NOT parcel-level. (`MU` GRZ = **0.8**, correcting the 0.60 in README §1.3.) | 100% (orientation ceiling only; the parcel rule is in the B-Plan) |
| **Actual GRZ** (parcel-level) | ❌ PDF (scan corpus) / ✅ WFS (content-vectorised corpus) | Hamburg (`app:hh_hh_festgestellt`) + Berlin (`b_bp_fs`) schemas VERIFIED LIVE 2026-07-24: **no GRZ attribute** — must read the Satzung PDF (`planrecht`/`scan_www`). BUT the content-vectorised path is **live-proven**: MV `demo.bauleitplaene-mv.de/ows/xplanung` `bp_baugebietsteilflaeche` returns populated `grz` (0.2–0.9) on ~33% of features. Split is per-plan digitisation depth (`findings/GERMANY-DATA-RECON-SPIKE.md`). | ~0% in HH/BE scan corpus; ~33% where content-vectorised (MV) |
| **Actual GFZ / Z (storeys)** (parcel-level) | ❌ PDF / ✅ WFS | German density is **GRZ + Z (Vollgeschosse)**, rarely GFZ. Absent from HH/BE schemas; MV WFS: `z` populated ~30%, `gfz` only ~5%. **Count `Z` as the height determinant** — it usually replaces metric height. | ~0% (HH/BE) … ~30% Z (MV) |
| **Actual Höhe (metres)** (parcel-level) | ❌ Rarely populated | Absent from HH/BE schemas; even in MV's content-vectorised WFS `hoehenangabe` was **0/162** — German plans regulate storeys + roof form, not metres. | ~0% (metric height is the wrong field to score Germany on) |
| Abstandsflächen — setbacks (LBO) | ✅ Formula (Bavaria confirmed) | BayBO Art. 6(5) VERIFIED LIVE 2026-07-23: 0.4H general, 0.2H in GE/GI, min 3 m; H = wall height + 1/3 roof height (roof ≤70°). Hamburg HBauO §6 and Berlin BauO Bln §6 JS-blocked — multipliers unknown. One shared `GeometricRule` kind (`setback`, height-proportional) covers the concept; multiplier is a per-Land config value. | ~35% (formula confirmed for Bavaria; Hamburg/Berlin blocked) |
| B-Plan PDF access | ✅ Full | Hamburg: `daten-hamburg.de/.../bplan/<planID>.pdf` confirmed HTTP 200, 581 KB. Berlin: `mitte.gis-broker.de/bplaene/<planid>.pdf` confirmed. | ~90% (PDF link confirmed; not a structured attribute) |
| §34 regime (no numeric rules) | ✅ Refusal | ~30% of Germany is §34 unplanned interior. Correct output: legally-grounded reasoned refusal ("no numeric envelope exists — §34 BauGB"). NOT a data gap. | 100% of §34 parcels receive a correct refusal — not a fill |
| Existing building heights (LoD2-DE) | ⚠️ Per-Land | ~58M buildings nationwide in CityGML LoD2. National feed restricted (INSPIRE Art. 13(1)(e)). Per-Land tiles: confirmed free for Sachsen-Anhalt, Baden-Württemberg; Berlin via FIS-Broker (stale post-migration). Bavaria: ZSHH host, terms TBD. Hamburg: unconfirmed. | ~30% (some Länder open; national access restricted) |
| DiPlanung / XPlanGML structured attributes | ⚠️ RESOLVED 2026-07-24 | `diplanung.de/schnittstellen` FETCHED: DiPlanung is a **plan-authoring + participation platform** (XÖV process interfaces + a DiPlan REST *process* API), **not a structured-data tap**. The data tap is the per-Land XPlanung WFS, whose attribute population depends on each plan's digitisation depth — content-vectorised (MV: `grz`/`z` populated) vs georeferenced scan (HH/BE: PDF-link-only). See `findings/GERMANY-DATA-RECON-SPIKE.md`. | conditional on the per-Land content-vectorised fraction (Phase 1b), not a single platform switch |

---

## The structural gap

Germany's gap from Denmark (~96%) is driven by a single fact: **XPlanung mandates the exchange
format schema, not that municipalities populate the numeric fields**. Hamburg completed a full
XPlanung migration (2,800 B-Plans, 2011–2018) — yet the probed WFS schema carries only plan
geometry, an ID, and a PDF link. GRZ, GFZ, and Höhe were never digitised into the structured
fields. This is structurally identical to Barcelona's Pla Parcial situation — digital infrastructure
exists; numeric parameters were not digitised.

**Germany's complication vs France** is not "which height mechanism" — BauNVO's zone taxonomy and
§17 ceilings are genuinely federal and identical across all 16 Länder. The complication is **which
of up to four mutually exclusive legal regimes governs a given parcel**, a classification step that
must run before any numeric sourcing:

| Regime | ~Fraction | Numeric output |
|---|---|---|
| §30 B-Plan (modern XPlanung) | ~60% of Germany | B-Plan WFS → PDF → GRZ/GFZ/Höhe (currently PDF-gated) |
| §30 Baunutzungsplan (Berlin 1958/60 only) | ~30% of Berlin | Baustufen grading; judicial voidance risk |
| §34 unplanned interior | ~30% of Germany | No numeric table — reasoned refusal is the correct output |
| §35 outlying area | ~10% of Germany | Presumptively not buildable — refusal |

The **§34 fraction is a permanent structural floor**, not a data gap: no B-Plan exists for those
parcels by definition. The ~30% §34 fraction means Germany's theoretical maximum fill rate — even
with fully digitised B-Plans for all §30 parcels — is ~65–70%.

**The pivotal unknown is RESOLVED (spike 2026-07-24) — and reframed.** DiPlanung is not the data tap
(it is a plan-authoring/participation platform); the tap is the per-Land XPlanung WFS. The structured
delivery path **exists and is live-proven** (MV WFS returns populated `grz`/`z`), so the §30 fill rate
*can* approach Denmark's — but only for the fraction of each Land's corpus that was **content-vectorised**,
which is ~0% in the big-city scan corpora (Hamburg, Berlin) and high in MV-style services. The new gating
measurement is therefore the *content-vectorised fraction per Land*, not a single DiPlanung probe. Details:
`findings/GERMANY-DATA-RECON-SPIKE.md`; climb: `RATE-IMPLEMENTATION-PLAN.md`.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| ~~Fetch `diplanung.de/schnittstellen`~~ **DONE 2026-07-24** — resolved: DiPlanung is a process platform, not a GRZ/GFZ tap; structured path proven via MV WFS instead | Reframed the fork: ceiling is gated on the per-Land content-vectorised fraction | Done |
| **NEW: measure the content-vectorised fraction per target Land** — does its WFS serve `bp_baugebietsteilflaeche` object layers with populated `grz`/`z` (MV-style) or plan-outline + scan only (HH/BE)? | Sets the achievable ceiling per Land (structured ingestion vs OCR path) | Low — one WFS probe per Land |
| Download Hamburg TB3.pdf — confirm text layer vs raster scan | Determines whether the Engine-2 OCR pipeline is viable for the German scan corpus | Low |
| Read Hamburg HBauO §6 and Berlin BauO Bln §6 via headless browser or PDF | Completes the Abstandsflächen formula set for three main German cities | Medium |
| Find Munich XPlanung / DiPlanung WFS endpoint | Confirms Munich as a third probed city; resolves whether Munich mirrors Hamburg's scan schema or MV's content-vectorised one | Medium |
| Run §34 coverage fraction grid-sample for Hamburg and Berlin bboxes (method: `RATE-IMPLEMENTATION-PLAN.md §3.5`) | Converts §34 fraction from an assumption (~30% national) to a measurement per city | Medium |

---

*Last updated: 2026-07-24. Hamburg WFS (`geodienste.hamburg.de/HH_WFS_Bebauungsplaene`) VERIFIED
LIVE — GRZ/GFZ/Höhe confirmed absent from schema (`planrecht`=PDF URL). Berlin WFS
(`gdi.berlin.de/services/wfs/bplan`) VERIFIED LIVE, open ("keine Zugriffsbeschränkungen") — GRZ/GFZ/Höhe
confirmed absent (`scan_www`=PDF URL). **MV WFS (`demo.bauleitplaene-mv.de/ows/xplanung`) VERIFIED LIVE —
structured `grz`/`z` POPULATED (~33%/~30%); the content-vectorised path is proven.** DiPlanung
`/schnittstellen` fetched: process platform, not a data tap. BauNVO §17 VERIFIED LIVE — Orientierungswerte,
`MU` GRZ 0.8. BayBO Art. 6 setback formula VERIFIED LIVE 2026-07-23. NRW LoD2 open feed reachable. Munich
WFS endpoint not yet found. Full transcript: `findings/GERMANY-DATA-RECON-SPIKE.md`. Maintainer: UNASSIGNED.*
