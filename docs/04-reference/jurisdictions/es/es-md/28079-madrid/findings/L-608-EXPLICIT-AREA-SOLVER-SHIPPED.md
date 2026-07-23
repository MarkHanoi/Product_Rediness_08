# L-608 — the `explicit-area` solver is BUILT (KG-4 engine-unblocked), + the NZ 4/8 sourcing re-attempt

> **What this is.** The engine-work record for this pass: the C58 §2.2 **KG-4** gate is now
> open — the `explicit-area` solver branch + its `ringRef` resolver exist, are jurisdiction-
> agnostic, and are tested. It also records a fresh, honest NZ 4/8/5/7 sourcing attempt (still
> human-gated) and one new structural finding about NZ 4's altura.
>
> Author: engine agent, 2026-07-23. Governance: C58 §1.4/§1.5/§1.9/§2.2 (KG-4), ADR-0270,
> JURISDICTION-PLAYBOOK P5/P6. Honesty rule: *failure and empty are the same VALUE, never the same
> ANSWER.*
>
> ⚠ **Written from an isolated worktree branched BEFORE the committed Madrid pack/docs existed.**
> The canonical `README.md` / `NEXT.md` / `sources/SOURCES.md` / `sources/VERIFICATION.md` and
> `packages/site-parcel-data/src/rulepacks/esMadridNZ1.ts` live in the mainline checkout. This
> note is ADDITIVE — it does not fork those trust-gate files; §5 lists the exact deltas the
> orchestrator should fold into them.

---

## 0 — TL;DR

- **KG-4 is no longer "declared, no engine branch".** `explicit-area` now solves. NZ 1 is
  therefore **engine-UNblocked** — what remains for NZ 1 is a Madrid L5 provider that fetches the
  published geometry and adapts it into the generic `ExplicitAreaSource` (§3), plus the L-449
  human sign-off. No further engine work.
- **The solver is a REUSABLE primitive, not Madrid-coupled** (founder directive). It consumes a
  plain footprint ring + a parcel and produces `parcel ∩ footprint`, with ZERO city-specific
  logic — the shared asset for any jurisdiction that publishes a buildable footprint as geometry
  (Madrid NZ 1 first; Córdoba fondos and future Barcelona *ordenació de volums* next).
- **NZ 4 / 8 / 5 / 7 remain DOCUMENT-gated** after a real re-attempt this pass. New structural
  finding: NZ 4's altura/edificabilidad is itself an Art. 8.9.10 **construction** (street width ×
  nº plantas × cornice), so once sourced it likely needs a street-width resolver, not a scalar
  fondo — the Madrid analogue of Barcelona's Art. 327.2 (L-525a).
- **Honest resolution unchanged in NUMBER, changed in KIND of blocker.** Shippable envelopes today
  ≈ **0 %**. But the ceiling's gating shifts: NZ 1's blocker was *engine + data*; it is now *data
  provider + sign-off* only. NZ 4/8/5/7 stay *human-read of the primary text*.

---

## 1 — What shipped (the engine, C58 §2.2 KG-4)

Three new pure modules in `packages/site-parcel-data/`, all L2, deterministic, no I/O:

| File | Role |
|---|---|
| `src/geometry/polygonClip.ts` | generic convex-clip polygon intersection (`clipPolygonToConvex`, `isConvexRing`) |
| `src/geometry/explicitArea.ts` | the reusable primitive: `resolveExplicitAreaRing` (the ringRef resolver) + `solveExplicitArea` (parcel ∩ footprint) |
| `src/ZoningRulesEngine.ts` | the `else if (kind === 'explicit-area')` solver branch (edit confined to the engine) |

Tests: `__tests__/polygonClip.test.ts`, `explicitArea.test.ts`, `explicitAreaEnvelope.test.ts`
— **+38 tests, suite 457 → 495, all green.** The `explicitArea.test.ts` fixtures are synthetic
rings + ratios with NO Madrid data — that file is the proof the primitive is reusable.

**The exhaustive-union gap it closed.** Before this branch an `explicit-area` pack fell through
the if/else chain to the plain setback inset and — because such a pack states no setbacks — the
inset was the WHOLE parcel. So registering NZ 1 would have silently published the entire plot as
buildable (the exact ADR-0270 defect), NOT the compile error the pack header assumed. The branch
now either solves (clip to footprint) or hard-refuses (no footprint / no overlap / non-convex),
never a whole-plot fallback.

---

## 2 — The solver's public interface (jurisdiction-agnostic)

```ts
// The ringRef resolver — turns a fetched source into a footprint ring, or a typed refusal.
interface ExplicitAreaSource {
  ringRef: string;                       // MUST equal rule.ringRef
  footprintRing: ReadonlyArray<Pt>;      // published buildable footprint (scene-XZ metres)
  edificabilidad?: number | null;        // FAR published alongside (e.g. Madrid COEF_Z), pre-parsed
  hasParcelOverride?: boolean;           // per-parcel override present (e.g. Ficha Específica) → defer
}
type ExplicitAreaRefusalReason =
  'ringref-mismatch' | 'no-footprint' | 'degenerate-footprint' | 'parcel-override';
function resolveExplicitAreaRing(rule: ExplicitAreaRule, source: ExplicitAreaSource):
  | { ok: true; footprintRing: Pt[]; edificabilidad: number | null }
  | { ok: false; reason: ExplicitAreaRefusalReason };

// The geometric solve — parcel ∩ published footprint.
function solveExplicitArea(input: { parcelRing; footprintRing }):
  | { ok: true; ring: Pt[]; areaM2: number; footprintCoversParcel: boolean }
  | { ok: false; reason: 'degenerate-input' | 'no-overlap' | 'non-convex-both' };
```

Engine seam: `ComputeBuildableEnvelopeInput` gained one optional field
`explicitAreaFootprint?: ReadonlyArray<Pt> | null` — INJECTED, never fetched, exactly like
`blockRing`. The edificabilidad rides the existing `maxFAR` resolution, so the branch stays purely
geometric. Nothing Madrid-specific enters the engine or the primitive.

**Known MVP limit (honest):** `solveExplicitArea` refuses `non-convex-both` when NEITHER the
parcel nor the footprint is convex (the convex-clip Sutherland–Hodgman contract — chosen because
it is robust to the shared *alineación* edge a general clipper chokes on). Cadastral parcels are
convex quadrilaterals far more often than manzana footprints, so this resolves the majority
exactly; a general concave-vs-concave clipper is the documented follow-up.

---

## 3 — What NZ 1 now needs (provider wiring, orchestrator/L5 — NOT engine)

The mainline `esMadridNZ1.ts` pack declares `ringRef: 'madrid-nz1:fondo-condiciones/v-2023'`. To
make it solve, a Madrid provider must, per parcel:

1. Fetch the manzana buildable polygon from `sigma.madrid.es/.../PGOUM97/PG_CONDICIONES_EDIFICACION`
   — layer 6 `Condiciones de la Edificación` (polygon) or layer 10 `Fondo` (polygon); or CONSTRUCT
   it by closing the layer-2 `Fondo de la Edificación` polyline against `Alineaciones`. (Which layer
   is the closed ring is still UNVERIFIED — the §2.1 open question in the mainline `L-608` spec.)
2. Parse `COEF_Z` (layer 6, typed String) under assertion → `edificabilidad`; refuse on an
   unparseable code (never default to 0).
3. Read `Ficha Específica` (layer 1): if a point falls in the parcel → `hasParcelOverride: true`.
4. Build `ExplicitAreaSource`, call `resolveExplicitAreaRing`, and inject the `ok` ring as
   `explicitAreaFootprint` into `computeBuildableEnvelope`. Stuff the parsed `COEF_Z` into
   `ZoningRecord.structuredFields.plotRatioFAR` (block granularity, C58 §1.11 — the card must say
   "block-published edificabilidad").

Then the L-608 registration unit in the pack header (register `esMadridNZ1.ts` + a Madrid
`JurisdictionRegistration` + the NZ 3 `derived-plan` refusal) can proceed, gated on the
`VERIFICATION.md` sign-off. **This agent did not touch `registry.ts` / `index.ts` (L-608 constraint).**

---

## 4 — NZ 4 / 8 / 5 / 7 sourcing re-attempt (Tier: measured negatives + one new structural fact)

Per the mandate to "try harder", this pass attempted the primary sources directly. Results:

- **`sigma.madrid.es` ArcGIS attribute planes — NETWORK-BLOCKED from this environment** (the fetch
  host could not be verified). So I could not re-probe whether NZ 4 conditions are served as data
  the way NZ 1's are. The prior pass's NZ 1 verification stands; this pass adds no NZ 4 data probe.
  ⚠ **Resume step (unchanged, still the highest-value):** from an environment that can reach
  `sigma.madrid.es`, list the `pgoum97` folder and check for an NZ-4 equivalent of
  `PG_CONDICIONES_EDIFICACION` — if NZ 4's fondo/altura are ALSO published as attributes, NZ 4
  becomes a DATA case (like NZ 1) rather than a document one, and reuses this same solver family.
- **Compendio 2023 `1 Compendio 2023.pdf` — exceeds the 10 MB fetch limit** (single-file WebFetch
  cannot open it). Needs a chapter-split copy or a local PDF reader / OCR of Cap. 8.4.
- **BOCM order `BOCM-20190514-50.PDF` — text not machine-extractable** by the fetch model (returns
  signature/font metadata, not body text); local PDF page-render unavailable here (no poppler).
  Same class of dead end the mainline `NEXT.md §7` already records.
- **Web search — returns the primary-source URLs + structure, not citeable numbers.** It DID
  surface one new structural fact worth keeping (below).

**NEW STRUCTURAL FINDING (Tier: VERIFIED-DOC, secondary-summary).** NZ 4's maximum buildability /
altura is governed by **Art. 8.9.10.1**, applied *"depending on street width, number of floors and
maximum cornice height"*. ⇒ NZ 4 altura is a **CONSTRUCTION**, not a stated scalar — the Madrid
analogue of Barcelona's Art. 327.2 (L-525a). Implication for the eventual NZ 4 pack: it is
`alignment`-shaped for the FONDO but will need a **street-width resolver** for the height, and an
*ample oficial* source Madrid may not publish machine-readably (the L-525a problem again). Record
this so no one encodes a single altura scalar for NZ 4 (the bare-`20a` category error, NEXT.md §4).

**Net:** NZ 4/8/5/7 numeric parameters stay `null` and human-gated. The Zod schema
(`buildableDepth_m.positive()`, the setback triple) correctly forbids a placeholder pack, so there
is nothing to author until a human reads Cap. 8.4/8.8 of the Compendio 2023. **No value was
interpolated.**

---

## 5 — Deltas for the orchestrator to fold into the canonical mainline docs

- **`README.md` pack status (NZ 1 line):** change "engine-blocked: `explicit-area` has no solver
  branch (C58 §2.2 KG-4)" → "engine-UNBLOCKED (KG-4 solver shipped, this pass); remaining =
  Madrid L5 provider + `VERIFICATION.md` sign-off."
- **`NEXT.md §3 blocker 2** ("NZ 1 is engine-blocked (KG-4)")**:** mark RESOLVED; replace the
  resume step with §3 above (provider wiring). Blocker 3 (which layer is the ring) is unchanged.
- **`NEXT.md §5 (already built):** add the three engine modules + 38 tests.
- **`sources/SOURCES.md`:** add an NZ 4 row under an *unverified* heading citing Art. 8.9.10 as the
  altura-construction reference (document, not data); no numeric value.
- **C58 KG-4:** the "declared, no engine branch" line is now false for the ENGINE half — the branch
  exists; only the *data-acquisition* question (does the source expose the footprint cleanly) and
  the per-jurisdiction provider remain. Update KG-4's status accordingly.

## 6 — Honest resolution (denominator named)

Denominator: a Madrid residential parcel click. **Shippable envelopes today ≈ 0 %** — unchanged.
Ceiling once the four NZs are sourced + NZ 1's provider ships ≈ **60–62 %** (0.65 × 0.96),
per-NZ split UNSOURCED. What this pass moved: NZ 1 is no longer *engine*-gated (the hardest, most
reusable blocker), only *provider + sign-off*-gated; NZ 4/8/5/7 stay *human-read*-gated. The
number did not move because a refusal-to-fabricate is not an envelope — but the remaining work on
the single reusable-across-cities blocker is now done.
