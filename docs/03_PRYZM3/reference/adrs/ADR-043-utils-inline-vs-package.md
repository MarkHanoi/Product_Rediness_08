# ADR-043 — `src/utils/*` Inline vs `packages/utils`

| Field | Value |
|---|---|
| Status | **Proposed** — 2026-04-29 (S73-WIRE D2) |
| Closes | `phases/audits/PRYZM2-WIREUP-PLAN-S72/24-pryzm1-src-coverage-audit.md` §24.4 (line 185); `PROCESS-TRACKER.md` §1 open decision row 3 |
| Required by | Sub-phase **G.21** — `DELETE src/utils/` (S84); also gates the Phase H "remaining src/" allowlist check (chunk 24 §24.7) |
| Owner | Architecture lead |
| Default if not ratified | Inline into consumers (per PROCESS-TRACKER §1) |

---

## Context

`src/utils/` contains 7 generic helpers (chunk 24 §24.1 row `utils/`):

| File | LOC (approx) | Used by |
|---|---:|---|
| `ActiveLevelGuard.ts` | 80 | level controller (`src/ui/levels/`) |
| `centeredWindows.ts` | 40 | window-element plug-in (`plugins/window/`) |
| `cesiumLoader.ts` | 60 | geospatial overlay (`src/geospatial/` → `packages/geospatial`) |
| `debugOverlay.ts` | 90 | dev-only HUD (`apps/bench/`) |
| `ImageToImportConverter.ts` | 120 | import manager (`src/ui/import/`) |
| `JSONRepair.ts` | 110 | persistence-client (`packages/persistence-client/`) |
| `PDFToImageConverter.ts` | 140 | PDF-to-BIM (`packages/pdf-to-bim/`) |

Total: ~640 LOC across 7 files. No two consumers overlap meaningfully.

Two placements were considered:

| Option | Behaviour | Cost |
|---|---|---|
| **A** | New `packages/utils` workspace package | +1 workspace package; cross-package import chain; unclear ownership |
| **B** | Inline each helper into its single consumer | Zero new packages; clear ownership; small duplication if a second consumer ever needs it (negligible) |

The PROCESS-TRACKER default is **B**. Chunk 24 §24.4 also recommended **B** ("most are tiny").

---

## Decision (proposed)

**Option B — inline into consumers.** During sub-phase G.21 (S84), each file is moved into the package or app that uses it:

| File | Destination |
|---|---|
| `ActiveLevelGuard.ts` | inline into `src/ui/levels/ActiveLevelGuard.ts` (UI-only; lives in white UI) |
| `centeredWindows.ts` | inline into `plugins/window/src/centeredWindows.ts` |
| `cesiumLoader.ts` | inline into `packages/geospatial/src/cesiumLoader.ts` |
| `debugOverlay.ts` | inline into `apps/bench/src/debugOverlay.ts` |
| `ImageToImportConverter.ts` | inline into `src/ui/import/ImageToImportConverter.ts` (UI-only) |
| `JSONRepair.ts` | inline into `packages/persistence-client/src/util/JSONRepair.ts` (joins existing `util/`) |
| `PDFToImageConverter.ts` | inline into `packages/pdf-to-bim/src/PDFToImageConverter.ts` |

**Rationale**: Each helper has exactly one consumer. A `packages/utils` would be a cross-package dependency hub for no shared logic. The PRYZM 2 architecture intentionally avoids "utils" packages because they become dumping grounds. Per chunk 24 §24.7, the Phase H allowlist for what may remain under `src/` includes `utils/` only if this ADR is **deferred** — Option B removes `utils/` from `src/` entirely, keeping the allowlist clean.

---

## Consequences

- **Sub-phase G.21** (S84) deletes `src/utils/` after the 7 file moves above.
- Phase H allowlist check (chunk 24 §24.7) does NOT include `src/utils/` — `src/` ends at GA with `ui/`, `styles/`, `types/`, `dev/`, `main.ts`, `browser-entry.tsx`, `browser.css`, `familyCreatorPlaceholder.ts` only.
- If a future helper needs > 2 consumers, the helper is created in the package closest to the canonical owner (e.g. `packages/persistence-client/src/util/`), never in a global `packages/utils`.

---

## Status transitions

| Date | Status | Note |
|---|---|---|
| 2026-04-29 | Proposed | Authored as Phase A entry-gate stub (PROCESS-TRACKER §4) |
| TBD | Accepted | Founder + Architecture lead ratification |
