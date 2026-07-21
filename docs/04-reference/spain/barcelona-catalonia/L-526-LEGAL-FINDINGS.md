# L-526 — Legal findings (primary-source research verdict, 2026-07-21)

Result of the parallel Claude-Chat investigation (prompt: `L-526-LEGAL-RESEARCH-PROMPT.md`). Several
firm conclusions; a few items still need the parcel *fitxa urbanística* + the official street width to
certify exact numbers. **These findings drive the L-525 + L-526 fixes.**

## ✅ CONFIRMED (actionable now)

### The articles do different jobs than our citation implies
- **Art. 242 (Profunditat edificable)** — the DEPTH definition. GEOMETRIC construction: trace an
  equidistant figure offset inward from the street façades; keep ≥ **30 %** of the illa as interior
  free space for *densificació urbana* (13a) (40 % for nucli antic); an **8 m-diameter circle** must
  inscribe between opposing interior building lines; **minimum depth = 12 m** (if the construction
  yields < 12 m, 12 m is taken); **absolute maximum = 30 m**. Sits under NNUU Títol IV, Cap. 2n, Secció
  2a ("segons alineacions de vial") — a GENERAL provision for that ordination type, not 13a-specific.
  ⚠ **Our pack's min-floor is 11 m; the real minimum is 12 m** — a bug to fix.
- **Art. 322.1** — **Edificabilitat**, i.e. the max VOLUME envelope from the zone conditions + the
  alignment-ordination parameters. It is a **bridge** to the general alignment rules — it does **NOT**
  state a depth number. ⚠ **Our citation attributes the 11 m depth to Art. 322.1, which is wrong** —
  depth is Art. 242 applied via Art. 327.1.
- **Art. 327 (Condicions d'edificació: Subzona I = 13a)** — the **HEIGHT** article. Clauses: 1 Alineacions,
  **2 Alçades**, 3 Façana mínima, 4 Cossos sortints, 5 Espai lliure interior d'illa. **No profunditat
  clause** — depth is inherited from Art. 242. Height for 13a also cites **Arts. 238 + 240 + 327**
  (per an official Barcelona *Certificat Urbanístic*).

### The 2008 modification is a HEIGHT change, not depth
**Art. 327 §2 modification — DOGC 29/09/2008, exp. 2007/028428 — amended paragraph 2 = the HEIGHT
TABLE.** It does NOT touch depth. So the panel caveat *"2008 modification to Art. 327 §2 not reflected"*
is about HEIGHT and **cannot explain the depth error.** Also: a source "consolidated to 31-12-2009"
SHOULD already contain a 2008 (DOGC 29-09-2008) modification → the caveat is **internally inconsistent**.

### Our citation vintage is STALE + ANACHRONISTIC
*"AMB Normativa Urbanística Metropolitana (Dec 2010), consolidated to 31-12-2009"* — **the AMB as an
institution did not exist until 21 July 2011**, so an "AMB … Dec 2010" attribution is anachronistic
(predecessor was the Mancomunitat/EMT). The authoritative current text is the **live consolidated refós**
on the AMB Geoportal de Planejament / NUMAMB and the **RPUC** (Registre de Planejament Urbanístic de
Catalunya) — a living document, not a frozen 2010 PDF. **Re-cite against the current Barcelona
consolidated NUMAMB + the original PGM article numbers.**

### The 13a alçada reguladora table (Art. 327.2) — CONFIRMED
| Amplada de vial | Alçada reg. màxima | Plantes |
|---|---|---|
| < 8 m | 8.55 m | PB+1 |
| 8–12 m | 11.60 m | PB+2 |
| 12–15 m | 14.65 m | PB+3 |
| 15–20 m | 17.70 m | PB+4 |
| 20–30 m | **20.75 m** | **PB+5** |
| ≥ 30 m | 23.80 m | PB+6 |
⚠ **Discrepancy to resolve:** an official Ajuntament de Barcelona *Certificat Urbanístic* for a 20 m
street gives **22.40 m (PB+5)** (via Arts. 238/240/327), vs 20.75 m in a Santa Coloma transcription of
the raw table. The Barcelona certificate (22.40 m) is the more authoritative for Barcelona (likely adds
parapet / planta sotacoberta / a Barcelona-specific consolidation). **Pau Claris ≈ 20 m street →
PB+5 ≈ 20.75–22.40 m.** Our **9 m ≈ PB+2 is wrong by ~2.5×.**

### Pau Claris 155 is ORDINARY 13a
Parcel **0230904DF3803** = Pau Claris 155. No MPGM/PE found modifying it (nearby 158-160 IS modified,
155 is not) → standard 13a rules apply. Expected: **depth ~24–28 m, height ~20.75–22.40 m (PB+5).**

## 🎯 THE DEPTH ROOT CAUSE (validates L-525b)
The research's strongest hypothesis for our **11 m**: *Art. 242 offsets the **ILLA (block)**, not the
parcel. Offsetting each PARCEL independently — or a PARTIAL/undersized block — collapses the depth to
~10–12 m, "remarkably close to your engine's output."* **Our block 02309 dissolved to ~6,686 m² ≈ HALF
a normal Cerdà manzana (~12,000 m²)** → the all-perimeter inset on a half-block floors out at ~11–12 m.
**CODE-VERIFIED 2026-07-21 — the bbox is NOT the cause; the Catastro masa genuinely = half the illa.** `server/parcelZoningProxy.js` uses `BLOCK_BBOX_HALF_DEG = 0.002` (~444 m box, ~4× a 113 m Cerdà block) with the **5-char refcat prefix** as the manzana filter (explicitly "a HEURISTIC … not a guarantee"). The bbox is large enough to capture a whole illa from any parcel in it — so masa **02309 genuinely contains only 14 parcels / 6,686 m²** (≈ half a Cerdà illa), while the pilot masa 02297 was a full illa (23 parcels / 14,090 m²). **Catastro masas do NOT always equal the urbanistic illa** — the prefix heuristic breaks here. COMPOUNDING: with roads=0 the all-perimeter-front model (L-502) then treats the masa's INTERIOR edge (facing the other half-masa / courtyard, not a street) as a street frontage → over-inset → the depth floors. **THE FIX = assemble the full illa** (union 02309 + its sibling masa into one Cerdà block) so all-perimeter-front is correct, and/or classify the block-interior edge as non-front. This is L-525b — real geometry/data work, not a one-liner. INTERIM SHIPPED (v254): the ordinance min-floor is now the correct **12 m** (was 11 m).

**This confirms L-525b (verify/fix the block dissolve) as the primary depth fix** — the depth is wrong
from the GEOMETRY (a partial block / not the full illa), not primarily from the legal rule.

## 🔧 CONCRETE FIXES (fold into L-525 + L-526)
1. **[L-525b] Fix the block assembly** — ensure `fetchBlockForParcel`/`dissolveParcelsToBlockRing`
   returns the FULL illa (~12,000 m² for a Cerdà block), not a half-block. Offset the whole illa
   (Art. 242), then intersect with the parcel — never offset the parcel alone.
2. **[pack] Fix the min-floor** — `minDepth_m` = **12 m**, not 11 m (Art. 242 minimum). Add the 8 m
   inscribed-circle interior check.
3. **[L-525a] Encode the Art. 327.2 height table** (above) keyed by amplada de vial; drive the massing
   height from it. **Use the OFFICIAL street width** (Art. 327 uses the *ample oficial del carrer*,
   e.g. 20.00 m) — NOT a GIS-measured width. Resolve the 20.75 vs 22.40 m PB+5 discrepancy against a
   Barcelona certificate before shipping the number.
4. **[L-526] Fix the citation** — depth = **Art. 242** (drop Art. 322.1 as the depth authority; 322 is
   edificabilitat); height = **Arts. 238 + 240 + 327**; re-cite the source as the **current Barcelona
   consolidated NUMAMB / RPUC** (drop the anachronistic "AMB Dec 2010 / 31-12-2009"); drop/repair the
   stale "2008 mod not reflected" caveat (it's a height change + the vintage is wrong anyway). Update
   `esBarcelonaEnsanche.ts` `ordinanceRef` + the panel citation; note in RISK-REGISTER R1.

## ⏳ STILL TO CERTIFY (needs the interactive planning GIS, not web search)
- The **exact depth number** for a full standard 13a block (the verbatim Art. 242 % + the precise
  figure) — pull the parcel **fitxa urbanística** from the MUC/PIU/RPUC viewer
  (`dtes.gencat.cat/muc-visor`, `geoportalplanejament.amb.cat`) for parcel 0230904DF3803.
- **Official street width** of Carrer de Pau Claris at 155 (the *ample oficial*, from the street DB).
- The **20.75 vs 22.40 m** PB+5 reconciliation (verbatim current Art. 327.2 as consolidated for Barcelona).
- Whether the **2008 §2** amendment changed the height numbers from/to what (confirmed it exists +
  amends the height table; the delta not isolated).

**Cross-refs:** L-525 (envelope accuracy — geometry), L-526 (legal), L-518 (block-constructed tier +
RISK-REGISTER R1 provenance), L-449 (the founder-signed source acceptance — this reopens the citation),
`esBarcelonaEnsanche.ts`, `blockDerivedDepth.ts`, C58, ADR-0270/0271.
