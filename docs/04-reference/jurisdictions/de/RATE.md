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
| BauNVO §17 density ceilings | ✅ Published | `gesetze-im-internet.de/baunutzungsv/__17.html` — GRZ/GFZ upper bounds per zone type. **These are national ceilings, NOT parcel-level values.** | 100% (ceiling only; the parcel rule is in the B-Plan) |
| **Actual GRZ** (parcel-level) | ❌ PDF | Hamburg WFS schema confirmed: no GRZ attribute in `app:hh_hh_festgestellt`. Berlin WFS confirmed: no GRZ in `bplan:b_bp_fs`. Must read the B-Plan Satzung PDF. | ~0% |
| **Actual GFZ** (parcel-level) | ❌ PDF | Same as GRZ — confirmed absent from both probed schemas. | ~0% |
| **Actual Höhe** (parcel-level) | ❌ PDF | Same. WFS carries plan boundary polygon and PDF link only. | ~0% |
| Abstandsflächen — setbacks (LBO) | ✅ Formula (Bavaria confirmed) | BayBO Art. 6(5) VERIFIED LIVE 2026-07-23: 0.4H general, 0.2H in GE/GI, min 3 m; H = wall height + 1/3 roof height (roof ≤70°). Hamburg HBauO §6 and Berlin BauO Bln §6 JS-blocked — multipliers unknown. One shared `GeometricRule` kind (`setback`, height-proportional) covers the concept; multiplier is a per-Land config value. | ~35% (formula confirmed for Bavaria; Hamburg/Berlin blocked) |
| B-Plan PDF access | ✅ Full | Hamburg: `daten-hamburg.de/.../bplan/<planID>.pdf` confirmed HTTP 200, 581 KB. Berlin: `mitte.gis-broker.de/bplaene/<planid>.pdf` confirmed. | ~90% (PDF link confirmed; not a structured attribute) |
| §34 regime (no numeric rules) | ✅ Refusal | ~30% of Germany is §34 unplanned interior. Correct output: legally-grounded reasoned refusal ("no numeric envelope exists — §34 BauGB"). NOT a data gap. | 100% of §34 parcels receive a correct refusal — not a fill |
| Existing building heights (LoD2-DE) | ⚠️ Per-Land | ~58M buildings nationwide in CityGML LoD2. National feed restricted (INSPIRE Art. 13(1)(e)). Per-Land tiles: confirmed free for Sachsen-Anhalt, Baden-Württemberg; Berlin via FIS-Broker (stale post-migration). Bavaria: ZSHH host, terms TBD. Hamburg: unconfirmed. | ~30% (some Länder open; national access restricted) |
| DiPlanung / XPlanGML structured attributes | ⚠️ Operational | DiPlanung live in 7 Länder (Bayern, Berlin, Brandenburg, Bremen, Hamburg, Niedersachsen, Schleswig-Holstein). API endpoint `diplanung.de/schnittstellen` not yet fetched — may carry structured GRZ/GFZ/Höhe or may replicate PDF-link-only schema. | ~20% (operational; attribute schema unknown) |

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

**DiPlanung is the pivotal unknown.** If the DiPlanung API returns structured GRZ/GFZ/Höhe for the
7 Länder where it is live, Germany's §30 fill rate approaches Denmark's for those Länder. If it
replicates the PDF-link-only pattern confirmed in Hamburg's XPlanung WFS, the path is PDF
transcription — same as Barcelona's OCR programme.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Fetch `diplanung.de/schnittstellen` — check API endpoint; determine whether GRZ/GFZ/Höhe are returned as structured fields | High potential: if structured, raises §30-parcel fill rate to ~45–55% for 7 covered Länder | Low — one API probe |
| Download Hamburg TB3.pdf — confirm text layer vs raster scan | Determines whether PDF-transcription pipeline (like Barcelona OCR) is viable for Germany | Low |
| Read Hamburg HBauO §6 and Berlin BauO Bln §6 via headless browser or PDF | Completes Abstandsflächen formula set for three main German cities | Medium |
| Find Munich XPlanung / DiPlanung WFS endpoint | Confirms Munich as a third probed city; resolves whether Munich mirrors Hamburg schema | Medium |
| Run §34 coverage fraction grid-sample for Hamburg and Berlin bboxes | Converts §34 fraction from an assumption (~30% national) to a measurement per city | Medium |

---

*Last updated: 2026-07-24. Hamburg WFS (`geodienste.hamburg.de/HH_WFS_Bebauungsplaene`) VERIFIED
LIVE — GRZ/GFZ/Höhe confirmed absent from schema. Berlin WFS (`gdi.berlin.de/services/wfs/bplan`)
VERIFIED LIVE DL-DE Zero 2.0 — GRZ/GFZ/Höhe confirmed absent. BayBO Art. 6 setback formula
VERIFIED LIVE 2026-07-23. DiPlanung operational in 7 Länder; API attribute schema NOT YET PROBED.
Munich WFS endpoint not yet found. Maintainer: UNASSIGNED.*
