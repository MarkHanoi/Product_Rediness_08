# Lane E2a — the never-overstate invariant + Seam-1 adoption (2026-09-01)

Wave E2 (plan §WAVE E2; REPORT §M lines ~546–565, §O REFACTOR row). Three deliverables, all
shipped, all falsified. **Nothing committed** (session standard). Raw falsification transcripts:
`impl/e2a-transcripts/`.

## Deliverable 1 — the two documented overstating mechanisms in `ZoningRulesEngine`

REPORT §M names them verbatim: *"unknown-setback→0-inset; maxFAR never capping volume."*

### Mechanism A — unknown setback → silent 0-inset (§NEVER-OVERSTATE-A)

- **What was already fixed before this lane:** §L-619 flags `footprintIsUpperBound` when **ALL
  THREE** setbacks are unresolved (the Copenhagen karré case).
- **What was still open:** a zone resolving `front=3 m` and leaving side/rear `null` still
  zero-inset the unknown edges **silently** — no flag, no caveat. The Madrid PGOUM-97 pack's own
  NZ 5 block comment documents the consequence: *"the geometric effect is the same: NO front
  inset. On a narrow street that OVER-STATES."*
- **Fix** (`packages/site-parcel-data/src/ZoningRulesEngine.ts`, §NEVER-OVERSTATE-A): ANY
  unresolved setback axis (`from === 'none'`), absent a footprint-shaping geometric rule, sets
  `footprintIsUpperBound = true` and pushes a caveat **naming the unresolved axes**. Direction per
  E4 control 9: unknown → honest tier-6-style visibility (near-wireframe upper-bound render, never
  the confident violet), **never** a refusal of envelopes that ship today (L-942: a gate whose
  "yes" branch disappears is a regression) and never a silent zero.

### Mechanism B — `maxFAR` returned but never capping `maxVolumeM3` (§NEVER-OVERSTATE-B)

- §L-616 computed `farLimitedHeight_m` for the RENDER split (shell + FAR solid), but the study
  volume stayed `effectiveArea × headlineHeight` — the full shell. Every non-render consumer of
  `maxVolumeM3` (facts card, capacity comparison, export) read a volume FAR forbids (Copenhagen:
  ~5.3× — the pre-fix pin measured **26,880 m³ vs 5,040 m³ permitted**).
- **Fix**: `maxVolumeM3 = min(uncapped, footprintArea × farLimitedHeight_m)` when FAR binds —
  the same §L-616 arithmetic, min-only so it can never raise a volume. Applied at **three
  sites** (one mechanism, three occurrences): the engine's solve-time block, and both
  `applyConstructedHeight` sites in `envelopeHeight.ts` (single-prism + tiered — the BCN clau-12
  constructed-height path, the ENVELOPE-REALISM-MATRIX "OVERSTATES-FAR" verdict).
- No schema refinement pins `maxVolumeM3` to `area × maxHeight` — verified before editing.

### Falsification (transcripts: `e2a-transcripts/prefix-RED-transcript.txt`)

`packages/site-parcel-data/__tests__/neverOverstateMechanisms.test.ts` (7 pins). Pre-fix engine
restored from HEAD → **4 pins RED, each naming its axis**:
- `side + rear axes unknown ⇒ upper bound: expected false to be true`
- `rear axis unknown ⇒ upper bound: expected false to be true`
- `FAR axis: maxVolumeM3 must be FAR-capped: expected 26880 to be close to 5040`
- `FAR axis: constructed-height volume must be FAR-capped: expected 3400 to be close to 1700`

Fixed files restored **byte-identically** (sha256 diff clean). Post-fix: 7/7 green; full package
suite **154 files / 3,186 tests green**.

### Three stale pins updated (the old overstated values, re-pinned to the honest ones)

- `zoningEngine.test.ts` — estimated default: `expectedArea × 12` → FAR-capped (FAR 2 binds at
  ~9.14 m of the 12 m shell).
- `tieredOccupationEnvelope.test.ts` — 22a shallow parcel: the pin stopped at the occupation cap
  (4,590 m³); the zone's own FAR 2 permits 1,800 m³. Now pins the min of both caps.
- `esMadridPgoum97Pack.test.ts` — "no zone is flagged upper-bound" → "flagged EXACTLY {5.1, 5.2,
  5.3}" (the NZ 5 grados with the pack-documented null front edge), caveat naming `front`.

No ceiling raised, no gate disabled, no gate-debt entry — these pins asserted the overstating
behaviour itself; updating them IS the fix's visible edge.

## Deliverable 2 — `tools/ga-gate/check-envelope-never-overstates.ts` (registered)

- Walks **every registered rule pack** live from `rulepacks/registry.ts`
  (`listJurisdictionCoverage` × `registeredPackZoneCodes` × `resolveZoneDisposition` — adopted
  machinery, no rival registry) + the estimated-default pack, solves a canonical 720 m² parcel
  through the REAL `computeBuildableEnvelope` (classified AND unclassified edge runs), rasterises
  through the REAL `envelopeToMassing`, and audits **five axes**: height, FAR, coverage, setback,
  volume (§1.14.4). A refusal draws nothing and cannot overstate — counted, never skipped.
- **Exit codes**: 0 pass · 1 real overstatement (names pack/zone/axis) · 2 UNPROVEN honesty
  floor (zero/too-few packs walked; planted tamper not flagged; import crash) · 3 unused —
  hard-fail-at-zero from birth, no baseline, no ratchet, and it must never acquire one.
- **Self-test with a planted overstating pack**, every run, two layers: (1) ENGINE TEETH — an
  in-memory pack (partial-unknown setbacks + binding FAR; never registered, never on disk — the
  rulepacks/ tree is E4-owned and untouched) through the real engine, so a mechanism revert is a
  REAL exit-1 finding; (2) CHECKER TEETH — the honest output tampered into the pre-fix shape must
  be flagged on both axes, else exit 2.
- **Registered in `run-all.ts`** beside its zoning siblings (`zoning-fidelity-label` /
  `height-fidelity`), not appended at the bottom.
- **Readings** (transcripts in `e2a-transcripts/`):
  - GREEN at final tree: **RC=0 — 6 pack-bearing jurisdictions · 181 zone-solves · 138 solved ·
    43 refused · 0 findings** (`gate-green.txt`).
  - RED against the pre-fix engine: **RC=1, 86 findings**, both mechanisms named on REAL corpus
    zones (Barcelona 20a FAR subzones; Madrid NZ 5 partial-unknown setbacks) plus the planted
    pack (`gate-prefix-RED.txt`).
  - Honesty floors proven to fire: floor tamper → **RC=2** (`gate-floor-2.txt`); checker-neuter
    tamper → **RC=2** *"the checker cannot see the defect class it polices"* (`gate-blind-2.txt`).
    Gate file restored byte-identically after both (sha256 diff clean).
- The gate prints its own NOT-ESTABLISHED list: it binds the engine + seam arithmetic, not pack
  curation correctness (a wrong transcribed number that stays self-consistent passes — L-449 owns
  that), not live providers, not pixels.

## Deliverable 3 — Seam-1 `envelopeToMassing` adoption finished

- **State found**: further along than REPORT §M's snapshot. `resolveFormaEnvelope`
  (GISAreaLayout) and the Cesium `renderFormaMassing` were ALREADY adopted (whole envelope →
  `envelopeToMassing` → `{ solids }`, dumb rasteriser). The LAST 4-field projection was the
  three.js BIM/plan surface: `ParcelBoundarySceneRenderer.buildEnvelopeVolume` re-derived ONE
  prism (`insetPolygon × maxHeight_m`, or an invented 9 m fallback) and discarded `tiers[]`,
  `farLimitedHeight_m`, and the §1.12.6 slab rule.
- **Adoption** (`apps/editor/src/ui/site/ParcelBoundarySceneRenderer.ts`): `buildEnvelopeVolume`
  now calls the SAME `envelopeToMassing` (+`envelopeGroundShade` for the footprint axis) and
  rasterises each `MassingSolid` — `[baseHeightM, topHeightM]`, `style.fillAlpha` (the seam's one
  knob set), `style.hue` mapped to the shared `envelopeRenderStyle.ts` hex constants,
  `style.openTop` as a literally uncapped shell. No per-field envelope knowledge remains; the
  9 m fallback constant is deleted (§1.12.6: a no-height envelope draws the 0.5 m slab, never an
  invented prism). Group keeps the `pryzm-buildable-envelope-volume` /
  `…-ground-shade` names; solids carry the seam's stable ids as mesh names (the same vocabulary
  the Cesium entities use). No re-design — the written seam executed, per the architecture doc
  Part 3 §3.1.
- **Behaviour deltas on this surface (all in the honest direction)**: FAR-limited zones now draw
  shell+solid instead of one full-height prism; tiered zones draw per-tier solids; null-height
  zones draw the slab; fill weights now come from the seam constants (solid 0.34 vs the old local
  0.16 — the two surfaces no longer drift).
- **Falsification** (`e2a-transcripts/seam-prefix-RED.txt`):
  `apps/editor/__tests__/parcelBoundarySeamAdoption.test.ts` (3 pins: shell+FAR split, per-tier
  solids, 0.5 m slab). Pre-adoption renderer restored from HEAD → **3/3 RED**; adopted renderer
  restored byte-identically (sha256 diff clean) → 3/3 green, plus
  `contextStudyMassingRender.test.ts` 7/7 green (mutual exclusivity + study massing intact) and
  `envelopeOneVisibility` structural pins green.

## Verification at final tree state

- `packages/site-parcel-data`: **154 files / 3,186 tests green**; `typecheck` green.
- Editor targeted suites: `parcelBoundarySeamAdoption` 3/3, `contextStudyMassingRender` 7/7,
  `parcelBoundaryEnvelopeOrdering`, `parcelShadeIsNotMirrored`, `gisActionRegistry`,
  `envelopeRenderStyle.spec` — green.
- New gate: RC=0 (see above). `check-gate-subject-floors` counts the new gate as FLOORED (not in
  its unfloored list).
- Root tsc: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` → **RC=0**.

## Discoveries recorded, not acted on (E4 control 10)

1. **Pre-existing RED, not this lane's**: `apps/editor/__tests__/envelopeOneVisibility.test.ts`
   › *"the card tells the user the footprint survives, at the same confidence"* fails at HEAD —
   `GISAreaLayout.ts` does not contain the pinned card copy (`buildable <b>footprint</b> still
   shaded on the ground`). Both files unmodified in git; deterministic source-grep failure.
   §ENVELOPE-TWO-AXES card copy, not Seam-1 — left for its owner.
2. **Pre-existing RC=3**: `tools/ga-gate/check-gate-subject-floors.ts` fails at HEAD — 2 gates
   unfloored (`check-fidelity-axis.ts`, `check-tool-activator-coverage.ts`, both tracked at
   HEAD) against a shrink-only ceiling of 0. Not moved by this lane.
3. `envelopeHeight.ts` carried the SAME mechanism-B line as the engine (`insetAreaM2 ×
   patch.height_m`, FAR computed beside it and unused for the volume) — fixed here as one
   mechanism/three sites rather than left as a known overstating sibling of a gated invariant.
4. The shared tree carries other E4 lanes' in-flight work (`packages/schemas/src/siteintel/`,
   `countryAdapters/`, `sourceRegistry/`, `parsers/`, schemas index/package.json, pnpm-lock).
   Untouched by this lane; all DO-NOT-TOUCH paths respected (rulepacks/ read-only).

## Files touched by THIS lane

- `packages/site-parcel-data/src/ZoningRulesEngine.ts` (§NEVER-OVERSTATE-A + -B)
- `packages/site-parcel-data/src/envelopeHeight.ts` (§NEVER-OVERSTATE-B, both sites)
- `packages/site-parcel-data/__tests__/neverOverstateMechanisms.test.ts` (new — mechanism pins)
- `packages/site-parcel-data/__tests__/{zoningEngine,tieredOccupationEnvelope,esMadridPgoum97Pack}.test.ts` (stale overstating pins re-pinned)
- `apps/editor/src/ui/site/ParcelBoundarySceneRenderer.ts` (Seam-1 adoption)
- `apps/editor/__tests__/parcelBoundarySeamAdoption.test.ts` (new — adoption pins)
- `tools/ga-gate/check-envelope-never-overstates.ts` (new gate)
- `tools/ga-gate/run-all.ts` (registration)
- this file + `impl/e2a-transcripts/`
