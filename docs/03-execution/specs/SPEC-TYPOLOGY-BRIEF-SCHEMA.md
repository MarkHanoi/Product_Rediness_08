# SPEC — Typology Brief Schema + Dynamic Brief UI

**Status:** DRAFT (2026-06-03) · **Owner:** PRYZM core · **Tracker:** O.12 (master-execution-tracker §3.0.3)
**Governs:** the onboarding **project brief** — how it gathers structured, typology-relevant design data and presents it to the user as easy-to-manipulate controls (sliders/steppers/toggles), replacing the free-text "Tell me about the project" box.

> Founder directive (2026-06-03): "The project brief needs to be sound — gather real relevant data for the process and present it to the user easily to manipulate — simple sliders to move from 2 → 4 apartment bedrooms. For other typologies more complex — house = number of floors, etc. Architecturally sound and well documented (contract / strategy / spec / ADR)."

## §1 — Principle (typology-agnostic, see [[platform-spine-typology-agnostic]])

The brief is **declared by the typology, not hard-coded in the UI.** Each typology's `TypologyManifest` carries a **`briefSchema`** — an ordered list of typed, bounded fields. The onboarding RAC renders that schema dynamically as controls; the captured values become the structured `Brief` object that drives the generation pipeline. Apartment is one case; house/office/school declare their own schema. **One source of truth** — the same `briefSchema` feeds the RAC brief step AND the "Choose a layout" picker (O.10), so they never drift.

## §2 — Brief field types (L0 schema, `@pryzm/schemas` or `@pryzm/typology-pipeline`)

```ts
type BriefField =
  | { kind: 'range';  id: string; label: string; min: number; max: number; step: number; default: number; unit?: string }   // slider
  | { kind: 'stepper'; id: string; label: string; min: number; max: number; default: number; unit?: string }                // ± integer
  | { kind: 'select'; id: string; label: string; options: { value: string; label: string }[]; default: string }            // single
  | { kind: 'multiselect'; id: string; label: string; options: { value: string; label: string }[]; default: string[] }     // chips
  | { kind: 'toggle'; id: string; label: string; default: boolean }
  | { kind: 'text';   id: string; label: string; placeholder?: string };                                                    // free "anything else"
interface BriefSchema { fields: readonly BriefField[] }
```
Zod-validated, pure (no I/O/THREE/DOM) per **P5**. The captured `Brief` is `Record<fieldId, value>` + the role/typology already captured.

## §3 — Per-typology schemas (initial)

- **Apartment** — bedrooms `range 1–5 step 1 default 2`; bathrooms `range 1–3 default 1`; style `select {modern·classic·minimal·warm}`; open-plan kitchen+dining `toggle`; master en-suite `toggle`; target area m² `range optional`; notes `text`.
- **House** — floors `stepper 1–4 default 2`; bedrooms `range 2–6`; garage `toggle`; garden `toggle`; style `select`; notes `text`.
- **Office** — floors `stepper`; headcount/desks `range`; meeting rooms `range`; open-plan ratio `range 0–100%`; notes `text`.
- (School/other typologies declare theirs when added.)

## §4 — Dynamic brief UI (RAC onboarding)

The RAC "PROJECT BRIEF" step reads `runtime.typology.registry.get(typologyId).briefSchema` and renders each field as a compact, on-brand (white + #6600FF) control — **sliders** for `range`, ± for `stepper`, chips for `(multi)select`, switches for `toggle`, one `text` box for "anything else". Live values shown (e.g. "Bedrooms 3"). White/purple, compact, draggable/resizable per the panel-chrome work. "Generate" uses the structured brief directly — no NLP parse needed for the structured fields (the free-text remains a supplementary hint).

## §5 — Pipeline wiring

The structured `Brief` flows: RAC brief step → `pryzm:onboarding-brief-ready` (metadata now carries the typed fields) → `briefBootstrap` → the typology pack's generate (`buildLayoutCommands` reads bedrooms/bathrooms/toggles directly instead of inferring from prose). The **"Choose a layout" picker (O.10)** binds to the SAME field set, so adjusting bedrooms there and in the brief are the one model.

## §6 — Governance

- This **SPEC** is the design of record.
- **Contract:** extend the typology-manifest contract (C16/C17 command-authoring + the TypologyManifest schema contract) with a normative `briefSchema` section, OR add a short `C5x` if a new contract is warranted.
- **ADR:** an ADR records the decision "briefs are typology-declared, not UI-hard-coded" (supersedes the free-text brief).
- **Strategy:** `product-vision.md` already says site-first, typology-agnostic; the brief schema is the typed front door to each typology pack.

## §7 — Implementation phases (tracker O.12.a–O.12.d)

- **O.12.a** — `BriefField`/`BriefSchema` L0 Zod schema + apartment `briefSchema` in the apartment manifest; contract/ADR text.
- **O.12.b** — RAC brief step renders the schema (sliders/steppers/toggles), captures the structured `Brief`.
- **O.12.c** — pipeline reads structured brief (`buildLayoutCommands`); the O.10 picker binds the same fields.
- **O.12.d** — house + office `briefSchema` (floors, etc.); proves the typology-agnostic seam.
