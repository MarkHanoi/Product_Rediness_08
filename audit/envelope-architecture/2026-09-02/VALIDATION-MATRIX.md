# FINAL PRE-IMPLEMENTATION VALIDATION — THE HARDEST-CONSTRUCTIONS MATRIX

**2026-09-02 · HEAD `2b7cc55d` · read-only · two lanes (West ES/FR/NL, North DK/EE/SE/DE), every
cell verified against the named file this session.** Constraints honoured: NO E4 redesign, NO
generic constraint graph, NO kernel replacement. Full per-cell detail with file:line citations:
`matrix-west.md` + `matrix-north.md` beside this file.

## HEADLINE

**The frozen architecture handles the hardest real European constructions.** Across 7 countries ×
12 construction classes, not one cell requires any of the three forbidden moves. The West's 30
populated cells: 20 PASS today. The North's strongest rows are live-proven by executed chains
(the Danish FAR triple computed a real Nørrebro GFA and REFUSED the Aarhus denominator that naive
code would have multiplied to 14,927 m² — "produced NOWHERE"). The recurring GAP set is small and
closed-form: **2 kernel additions + 3 schema kinds/attributes + wiring/data** — all already named
by the architecture audit, now each with multi-country demand proven.

## THE MATRIX (strongest exemplar per row; full grid in the lane files)

| Construction | Exemplar (country · rule) | Current representation | Geometric op | Verdict |
|---|---|---|---|---|
| Building lines | ES Madrid "SOBRE y a lo largo de la alineación oficial" | `alignment` kind, offset-0 build-to | inset(0) | **PASS** (7-ctry; DE Baulinie routes via enclosed ring → `explicit-area`, NOT `alignment` — lane B's 1:1 corrected) |
| Variable setbacks | ES BCN Art. 342.5 four-column ladder | banded lookup w/ band-edge refusal | per-band inset | **PASS**; DE 0.4×H → GAP `HEIGHT_PROPORTIONAL_OFFSET` |
| Street-width heights | ES ×3 shipped (BCN/Madrid/Murcia anchoDeCalle) | dedicated modules, band-edge refusals | scalar cap | **PASS** ES; FR filet carried-not-capping → rides `CONTEXT_AGGREGATE` |
| Inclined planes | DK *det skrå højdegrænseplan* (1.4×d) | **ZERO repo hits — all three audit lanes missed it** | — | **GAP (kernel #1)**: piecewise-planar tops; same primitive serves DE §6, Paris crown, ES coronación, NL dakhelling |
| Stepbacks/áticos | ES 350.2 tiled tiers | EnvelopeTierSchema live; no pack authoring seat | extrude-tiers | **PASS-model / GAP-authoring-seat** |
| Height fields | FR Paris plub_hauteur/ECM/HMC min-of-candidates | explicit polygon + min() | clip+extrude | **PASS** (Madrid NZ1, BCN clau 18, NL maatvoering same class) |
| FAR+coverage+height | DK bebygpct×etager×højde with `valueBasis` | declarative triple, denominator-safe | scalar solve + labelled choice | **PASS — the live-proven star row** (Telde refusal + Córdoba choice = the honest output family) |
| Courtyards/holes | DK karré via `block-derived-alignment` | shipped 4-tier ladder | block solve | **PASS** DK/ES; **NL hole-drop = the one live overstate (L-12896, fix running)** — wiring, engine already supports holes |
| Neighbour deps | PT moda da cércea / FR héberges | draft blocked on the kind / zero hits | context aggregate | **GAP** `CONTEXT_AGGREGATE` (founder-authorized); héberges → research |
| Terrain datum | ES rasant trams (`facadeRasantDatum.ts` Art. 240) | shipped façade datum | datum resolve | **PASS** ES; DE "72.2 m über NHN" class → GAP `datum` attribute (4 legal meanings, 1 token) |
| Overlays/exceptions | ES clau 18 + heritage + flood + `regime-undetermined` | explicit geometry + refusals | clip | **PASS** ES only; **`ZoningRecord.overlays` consumed by NOTHING; zero northern providers** — wiring |
| Temporal | DK verbatim status (`_vedtaget` only, safe direction) + EE `dp_kehtiv` | status-gated ingestion, `isInForceOn`, `ruleSetVersion` | — | **PASS structural**; pending-restriction class (NL voorbereidingsbesluit, DE Veränderungssperre) → research |

## A. MISSING GEOMETRIC PRIMITIVES (genuinely required — nothing else)
1. **Piecewise-planar (inclined) tops as a height-field** — five-country demand; DK's absence is a
   latent near-boundary overstatement class invisible to the gate (DK contributes zero solves).
2. **Polygon difference (A∖B) + holes in booleans** — oracle-pinned, under-coverage bias (NL/DE
   courtyards; the NL fix already flows through the existing parts seat).

## B. MISSING ENGINE CAPABILITIES (append-only seats, no redesign)
1. `datum` attribute on height rules (rasant / NGF / NHN / EH2000 / street / mean-ground).
2. `HEIGHT_PROPORTIONAL_OFFSET` kind (DE 0.4×H; PT afastamento H/2; Madrid NZ5 front-to-axis).
3. `CONTEXT_AGGREGATE` / `fabricDerivedHeight` kind (Porto moda — flip rides it, founder-signed).
4. Overlay consumption end-to-end + RASE mandatory-carry caveat parity (NL goothoogte vs Paris).
5. Never-overstate fixtures for LIVE-RESOLVED routes (Paris draws signed and un-walked; DK zero
   solves; NL) — the 6/115 → 115 closure — plus the **never-understate** sibling gate (new axis).
6. Pack-side tier-authoring seat for áticos/podium (model exists).

## C. OPEN-SOURCE TO REUSE
XPlanGML as the DE input standard (with the Baulinie→enclosed-ring correction) · COMPASS's four
verification patterns (partially ported in E8 already) · Catala's prioritized-default precedence
model (DK rank-as-fact already embodies it — endorsed by execution) · poppler/pdf.js dual-engine
verification (proven in the Porto pins) · `manifold-3d` stays display/export-only. **No adoptable
European buildable-envelope OSS exists — verified twice.**

## D. EXPLICITLY NOT BUILD
Generic constraint graph · third vocabulary seat · kernel replacement (clipper2/martinez/JSTS/
three-bvh-csg for the legal path) · full 3D CSG · per-country envelope engines · per-country
kernel plug-in seat · CGA-style grammar sampling as the envelope · any LLM in determination ·
AS-IS geometry as a legal ceiling · a new canonical model.

---

## IMPLEMENT NOW
1. **NL hole-forwarding fix** (L-12896 — live overstate; lane already running).
2. **Inclined-plane tops** kernel primitive (+ difference op + holes) — the one kernel investment,
   five countries served, closes DK's latent overstatement class.
3. **The three schema seats** — `datum`, `HEIGHT_PROPORTIONAL_OFFSET`, `CONTEXT_AGGREGATE` —
   append-only, one ADR each; Porto's signed flip rides the third.
4. **Gate fixtures for live routes** (Paris first — signed and un-walked; DK; NL) + arm the NL
   courtyard fixture permanently.
5. **Overlay consumption wiring** + the caveat-parity fixes.
6. **German QualifierLexicon merge** (L-12889, already logged).

## DO NOT BUILD
The full §D list above — each item has a named shipped authority or a proven failure mode.

## RESEARCH LATER
Pending-restriction temporal class (voorbereidingsbesluit / Veränderungssperre — no data channel
probed yet) · FR héberges (needs the 3D stage) · the never-understate gate's formal design ·
straight-skeleton stage 2 · the per-face-attributed 3D stage + `ruleSetVersion` cache (the
audit's two accepted seams — after the seats above) · XPlanGML adapter at scale (rides the DE
acquisition re-budget, L-12886).
