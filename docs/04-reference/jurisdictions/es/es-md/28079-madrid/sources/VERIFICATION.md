# Madrid (INE 28079) — human verification / sign-off

**Status: DRAFT. NOTHING SIGNED. No pack may ship `confidence: 'structured'` (or be registered)
until this file records a human sign-off (the L-449 gate).**

## What a human must confirm before a Madrid ENVELOPE pack ships

### NZ 1 (`explicit-area`) — data is live, but two things need confirming AND the engine must exist
- [ ] `COEF_Z` numeric semantics: run a live `query` on layer 6 for a known central manzana and
      confirm how the String parses to an edificabilidad (bare float? coded? unit?).
- [ ] Which layer is the closed buildable RING (layer 6 `Condiciones` polygon vs layer 10 `Fondo`
      polygon vs a constructed close of the layer-2 polyline against Alineaciones).
- [ ] `permittedUse: residential` re-cited to the Compendio 2023 Cap. 8.1/8.3 (currently SECONDARY).
- [ ] **Engine gate (not a sourcing item):** the `explicit-area` solver branch (C58 §2.2 KG-4) and
      the ringRef resolver exist and are tested. Until then NZ 1 cannot be registered (compile error).

### NZ 4 (`alignment`) — everything is document-gated
- [ ] Fondo edificable (`buildableDepth_m`) per grado — read from Compendio 2023 Cap. 8.4, quoting
      the Art. 8.4.x number. **`.positive()` required; no pack without it.**
- [ ] Altura de cornisa + nº plantas per grado; ocupación; usos cualificados/compatibles.

### NZ 8 / 5 / 7 (`setback`) — everything is document-gated
- [ ] Retranqueos front/side/rear per grado (Cap. 8.8 / 8.5 / 8.7). Full triple required.
- [ ] Altura / plantas / ocupación / edificabilidad per grado.

### NZ 3 (refusal) — copy only
- [ ] Confirm the `derived-plan` refusal copy (`sources/SOURCES.md` §D) against Cap. 8.3.

## Signed off

| Who | When | Against which document version | What they could NOT confirm |
|---|---|---|---|
| — | — | — | (nothing signed yet) |

## Explicit non-confirmations recorded this pass (research agent, 2026-07-23)

- The queryable Norma-Zonal calificación endpoint was **NOT** re-verified (service HTTP 500 this pass).
- No NZ 4/8/5/7 numeric value was sourced citeably — all remain `null`.
- The per-NZ land-share split is **UNSOURCED**; the resolution ceiling (~60–62 %) is a product of two
  prior-verified fractions, not a measured first-pack number.
