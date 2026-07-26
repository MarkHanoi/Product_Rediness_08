# Denmark — Envelope Rules → Geometry

> Country-level envelope rules for Denmark (Plandata.dk / lokalplan regime). Municipality
> overrides (e.g. Copenhagen's karré courtyard depth) are noted in §2 and belong in a city folder
> once one exists. Companion to `ENVELOPE-REALISM-MATRIX.md` (verdict today: **OVERSTATES-BOTH**).
> Driven by founder Copenhagen tests (2026-07-26) + audit **L-616** / **L-619**.

Governed by **C58**. See also `README.md`, `sources/`, and the `§DK-HONEST-REFUSAL` path.

---

## 0 · Status

| Field | Value |
|---|---|
| Governing instrument(s) | **Lokalplan** (binding local plan) + **kommuneplanramme** (framework) + **Bygningsreglementet BR18** (national building reg) |
| Envelope model | height + plot-ratio (bebyggelsesprocent) + **friareal (open-space / courtyard)** + byggelinjer (setback lines) |
| Engine branch today | legacy setback-inset with **null setbacks → 0 inset → full parcel** (the bug) |
| Realism verdict | **OVERSTATES-BOTH** — footprint = whole parcel (mechanism A) + FAR ignored (mechanism B, now partly fixed by L-616 `farLimitedHeight_m`) |
| Gate flag | none (Plandata is a real feed; `§DK-HONEST-REFUSAL` handles gaps) |

## 1 · The envelope parameters

| Parameter | Value / rule | Source | Structured? | Citation |
|---|---|---|---|---|
| Max height (m) | `maxbygnhjd` | Plandata WFS | ✅ **structured** | plan feature · dokument.plandata.dk |
| Max storeys | `maxetager` (floored to int) | Plandata WFS | ✅ **structured** | plan feature |
| Plot ratio / FAR | `bebyggelsesprocent / 100` (= GFA / lot area) | Plandata WFS | ✅ **structured** | `bebygpct` |
| Coverage (footprint %) | NOT the same as bebyggelsesprocent | — | ❌ **absent** | (FAR ≠ coverage; honest null) |
| Setbacks (byggelinjer) | per-edge building lines | **separate** Plandata `byggelinjer` dataset — NOT on the plan feature | 🟡 **PDF/dataset, not wired** | lokalplan · byggelinjer WFS |
| **Buildable depth / courtyard** | karré (perimeter block) → interior kept open | lokalplan | 🟡 **PDF** | lokalplan courtyard provisions |
| **Friareal (open-space req.)** | min open/recreation area per m² floorspace — materialises AS the courtyard | BR18 + lokalplan | 🟡 **PDF** | BR18 §393-399 (opholdsareal) + lokalplan |
| Permitted use | `anvendelsegenerel` | Plandata WFS | ✅ **structured** | plan feature |

## 2 · How the rules materialise into geometry

**Today (wrong):** `full parcel ring × maxHeight`. Setbacks null → `?? 0` → no inset; FAR reported
but (pre-L-616) not capping volume. Result = a whole-parcel block to 24 m. This is why the founder
correctly said "you can't build the whole boundary — every parcel here has a courtyard."

**Correct (the target):**

| Rule | Geometric operation | Order | Engine hook |
|---|---|---|---|
| Byggelinjer (setbacks) | inset the parcel ring per edge | 1st | `insetPolygonPerEdge` — needs the byggelinjer feed wired |
| **Courtyard / friareal** | **carve the block interior** — build only a depth-band around the street frontage | 2nd | **reuse `block-derived-alignment`** (Barcelona's profunditat machinery — same shape) |
| FAR (bebyggelsesprocent) | cap floorspace ≤ FAR × lot → `farLimitedHeight_m` | with height | ✅ shipped (L-616) |
| Max height | extrude to `maxHeight_m` (the shell) | last | `CesiumViewport` shell |

**⚠ KEY FINDING (founder, 2026-07-26).** Copenhagen's karré courtyard is **the same geometry** as
Barcelona's *profunditat edificable* (PGM Art. 242.2): a buildable **depth band** around the block
perimeter, interior left open. **The machinery already exists** (`ZoningRulesEngine.ts`
`block-derived-alignment`, which makes BCN 13a/13b REALISTIC). Denmark can reuse it — the only new
input is the **band depth**, which is human-gated (lokalplan/friareal, PDF). Absent the exact depth,
carve a **conservative** courtyard from the block ring and label it a STUDY — far more honest than
filling the parcel.

**Target shape, one sentence:** a depth-band around the street frontage, inset by byggelinjer,
extruded to the FAR-limited height inside the 24 m legal shell, **with the block interior left as
courtyard**.

## 3 · Sourcing status

- **Structured now:** max height, storeys, FAR, use (Plandata WFS).
- **PDF / dataset, human-gated:** byggelinjer (separate WFS — wire it), courtyard depth / friareal
  (lokalplan + BR18 §393-399). Same cost class as Barcelona's per-zone numbers.
- **Absent:** footprint coverage % (FAR ≠ coverage — honest null).

## 4 · Cross-references

- Rule pack / provider: `packages/site-parcel-data/src/providers/mapPlandataToZoningRecord.ts`
  (setbacks hardcoded null, line ~277) · `dkPlandataRefusal.ts`
- `ENVELOPE-REALISM-MATRIX.md` (DK = OVERSTATES-BOTH) · Barcelona `ENVELOPE-RULES.md` (the reusable pattern)
- Audit: **L-616** (FAR + footprint honesty) · **L-619** (perimeter-block courtyard envelope + this doc series)
