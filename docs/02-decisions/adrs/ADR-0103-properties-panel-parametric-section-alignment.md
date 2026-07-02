# ADR-0103 — Element properties panel: converge parametric sections onto the shared aligned-grid inspector

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-02 |
| Owner | Editor UI — property panel (`apps/editor/src/ui/property-panel`, `apps/editor/src/ui/styles/panels/propertyInspector.ts`) + parametric sections (`packages/geometry-door`, `packages/geometry-window`) |
| Tags | §FIX-PROPERTIES-PANEL-POLISH |
| Contracts | C06 (UI shell & tools) · C18 (element preview visual contract) · P4 (no `(window as any)` — untouched) · P6 (commands remain the only mutation path — untouched) · 8-layer rule (UI/design-token layer only) · brand white + `#6600FF`, no black |

## Context

The founder flagged the element **properties / inspector panel** (repro: the WINDOW
panel) as visually unsound versus a modern web-tool inspector:

- stray / unnecessary divider lines,
- the value column misaligned — e.g. *"Width 1.2"* / *"Height 1.2"* values not landing on
  a shared right-aligned column,
- inconsistent spacing / rhythm.

Ask: *"remove unnecessary lines, make everything absolutely aligned, make it feel
organically nice to use"* — as a **design-system** change that lifts EVERY element's panel,
not a per-element one-off.

### Root cause

The live panel is `PropertyPanel` (`property-panel/`, `gpp-` prefix). Its schema-driven
sections (Identity, Spatial, Definition, Instance, Relationships, Metadata) already render
through a clean shared 2-column grid (`.gpp-section-body { grid-template-columns: 104px 1fr }`).

But the **parametric** sections for doors and windows are bespoke: `buildDoorSection`
(`@pryzm/geometry-door`) and `buildWindowSection` (`@pryzm/geometry-window`) build their own
`.dw-field` rows styled by the SHARED `DOOR_SECTION_STYLES` sheet in `propertyInspector.ts`.
That sheet used `.dw-field { display:flex; justify-content:space-between }` with **per-control
fixed widths** (`.dw-number` 64px, `.dw-text` 90px, `.dw-select` min 90px, sliders inline 70px,
`.dw-color` 32px). Because each control was a different width and there was no shared value
column, the values were ragged — exactly the founder's repro.

Two latent bugs compounded it:

1. **Dead toggle state.** The builders apply `classList.add('active')`, but the sheet only
   defined `.dw-toggle-btn--active` — so the selected segment (Single/Double, Left/Right,
   Inward/Outward, Sill On/Off …) never lit up.
2. Inconsistent input affordance — number/text used an underline while selects used a full
   box border, so controls in the same column didn't read as one family.

## Decision

Converge the bespoke `.dw-` parametric sections onto the **same aligned 2-column grid** the
schema-driven `.gpp-` sections use, entirely within the shared design-token stylesheet
(`DOOR_SECTION_STYLES`) plus minimal class-hook changes in the two section builders. No new
parallel styling system; no command/behaviour change.

- **Alignment.** `.dw-section-body` becomes `display:grid; grid-template-columns:108px 1fr`.
  `.dw-field` becomes `display:contents` so its label + control drop straight onto the grid
  tracks — the control's LEFT edge is the shared value column and every control (`width:100%`)
  stretches to a single shared RIGHT edge. Fixed per-control widths removed.
- **Remove unnecessary lines.** No per-row rules; section cards + generous rhythm (`gap:7px 12px`)
  provide separation, matching the `gpp-` cards. Card metrics aligned (`margin:0 0 8px`) so the
  door/window cards sit flush with the schema cards inside the shared `.gpp-body` padding.
- **One input family.** Number / text / select all use the same underline affordance and focus
  colour (`--app-accent`). Toggle groups fill the column as evenly-split segments; sliders fill
  the column with a right-pinned tabular-nums readout (`.dw-slider` / `.dw-slider-value`).
- **Typography / brand.** Muted label (`--app-text-muted`), strong value (`--app-text`),
  uppercase section title with matching letter-spacing; all accents via PRYZM purple tokens
  (`--app-accent`, `--app-gradient`); no black.
- **Bug fixes.** Toggle CSS now targets `.dw-toggle-btn.active` (the class the builders apply;
  `--active` kept for back-compat). Section-collapse handlers restore `display:grid` (was `flex`).

### Files changed

- `apps/editor/src/ui/styles/panels/propertyInspector.ts` — rewrote `DOOR_SECTION_STYLES`
  (aligned grid, one input family, slider + toggle classes, active-state fix).
- `packages/geometry-window/src/WindowSection.ts` — `makeSlider` emits `.dw-slider` /
  `.dw-slider-value` (was inline fixed widths); collapse restores `grid`.
- `packages/geometry-door/src/DoorSection.ts` — material-select wrapper fills the value column;
  collapse restores `grid`.
- `apps/editor/src/ui/__tests__/binding/PropertyPanelSectionStyles.spec.ts` — new CSS-contract
  test locking the aligned-grid model + active-state + brand tokens.

## Consequences

- Door and window panels now share the same aligned value column and rhythm as the
  schema-driven sections; the whole inspector reads as one polished web-tool panel.
- The `.dw-` sheet remains the single shared primitive for any future parametric section — new
  element types that build `.dw-field` rows inherit the aligned layout for free.
- Purely presentational: bindings (real-time dispatch, dropdowns, sliders, colour pickers,
  Copy ID, collapsible sections, default-type pickers, frame-colour/opacity) are unchanged.
- Follow-up (not in scope): the header `Element Code` row still uses inline styles; the
  read-only `.gpp-prop-value-ro` in schema sections keeps a hairline underline by design.
