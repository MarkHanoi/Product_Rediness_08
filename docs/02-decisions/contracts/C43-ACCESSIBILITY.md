# C43 — Accessibility (WCAG 2.2 AA)

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: governs **accessibility compliance** for every UI surface PRYZM ships — the editor canvas, panels, menus, dialogs, marketing site, developer dashboard, support tooling, admin tooling, status page. Codifies the WCAG 2.2 Level AA targets (with Level AAA aspirations on specific surfaces), the keyboard-navigation model, the screen-reader semantics + announcement strategy, the focus-management discipline, the contrast + colour-blindness policy, the motion + animation policy (incl. `prefers-reduced-motion`), the 3D-canvas accessibility strategy (a known hard surface; we declare the bounded responsibility), the testing harness, the per-release accessibility-audit cadence, the VPAT publication, the audited remediation cycle for filed accessibility issues. **One target — WCAG 2.2 Level AA** — across every shipped surface; specific AAA elevations called out per surface.
> **Depends on**: [C06](C06-UI-SHELL-AND-TOOLS.md) (UI shell + tool registration — accessibility hooks into the same surface), [C04](C04-RENDERING-AND-SCHEDULING.md) (rendering — 3D canvas accessibility strategy + reduced-motion), [C44](C44-MOBILE-AND-TABLET.md) (mobile + tablet — gesture-driven accessibility differences), [C45](C45-BROWSER-AND-DEVICE-MATRIX.md) (screen-reader matrix per browser × OS), [C46](C46-I18N-AND-L10N.md) (lang attribute + locale-aware reading order + RTL).
> **Sibling**: [C44](C44-MOBILE-AND-TABLET.md), [C45](C45-BROWSER-AND-DEVICE-MATRIX.md), [C46](C46-I18N-AND-L10N.md). C43 governs the accessibility rules; C44/C45/C46 govern the platform variance that affects how those rules realise.
> **Downstream**: every UI surface in `apps/*` + `packages/ui-base/` + plugin-emitted UI · VPAT (Voluntary Product Accessibility Template) shipped quarterly · public accessibility statement at `pryzm.app/accessibility` · CI gates (axe-core + jest-axe) blocking merges on regressions.
> **Key principles**: **P6** (UI is the only mutation surface — accessibility rules thus all run at the UI layer), **P5** (accessibility metadata is L0-pure — aria-label, role, lang attributes are schemas not behaviour), **P8** (accessibility violations + remediations emit spans for the trust-report).
> **Master plan**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md §13 (Phase 6.3 accessibility & device)](../03-execution/plans/master-implementation-plan.md).
> **Audit-source**: [MISSING-CONTRACTS-AUDIT-2026-06-01.md §3.4](../MISSING-CONTRACTS-AUDIT-2026-06-01.md).

---

## §1 — Invariants

### §1.1 — Every shipped UI surface meets WCAG 2.2 Level AA

Every customer-facing UI surface — the editor, the marketing site, the developer dashboard, the customer billing/support surfaces, the in-product help, the public status page — meets WCAG 2.2 Level AA at ship. New surfaces MUST pass the CI axe-core suite before merge. Existing surfaces with known violations carry an `accessibility-debt` issue in the tracker with a remediation deadline.

The four POUR principles (Perceivable · Operable · Understandable · Robust) are honoured; per-criterion details are documented at the criterion-level checklist (§6.2 conformance suite).

### §1.2 — 3D canvas: bounded responsibility

The 3D canvas (rendered by [C04](C04-RENDERING-AND-SCHEDULING.md) `packages/renderer-three`) is the irreducible hard case. WCAG was not authored with 3D-design tools in mind. PRYZM's bounded responsibility:

- **Operable** — every action available via the canvas (create element · select · move · delete · group) MUST also be available via the keyboard-driven command palette + the form-based property panel. A user who cannot use a pointing device MUST still be able to author a complete model. The keyboard surface is documented per tool in `docs/05-guides/accessibility/keyboard-tool-reference.md`.
- **Perceivable** — the canvas itself is not screen-reader-narrated geometrically; instead the property panel + the inspect tree ([C27](C27-BIM3-INSPECT-MODEL.md)) provide the screen-readable representation. A blind architect collaborates with a sighted partner today; the contract makes both sides workable, not the latter alone.
- **Understandable** — selection state, hover state, current-tool state are announced via aria-live regions on the editor shell, NOT on the canvas.
- **Robust** — the canvas degrades gracefully if WebGL is unavailable; a fallback screen reader-accessible read-only view of the project (via [C29](C29-PDF-VECTOR-EXPORT.md) PDF + the property panel) is offered.

This is the most honest framing of accessibility for a 3D design tool. AAA "alternative for time-based media" does not apply; AAA "low or no background audio" trivially passes (no audio).

### §1.3 — Keyboard navigation is exhaustive

Every interactive element MUST be reachable + operable via the keyboard alone (WCAG 2.1.1). Tab order MUST be logical (DOM order + explicit `tabindex` only when required). Focus indicators MUST be visible (3:1 contrast minimum vs background, per WCAG 2.4.11 AAA elevation — PRYZM aspires AAA here because every surface is professional-tool grade).

The "trap" rule: focus MUST NOT be trappable except in modals (where the trap is required by WCAG 2.4.3). Modals MUST restore focus to the element that opened them on close.

The keyboard surface for every tool is registered in `packages/ui-base/keyboardRegistry.ts`; CI validates that no tool ships without a keyboard surface.

### §1.4 — Screen-reader semantics use the platform-native API

The product uses ARIA (Accessible Rich Internet Applications) as the screen-reader contract. ARIA roles MUST match WAI-ARIA Authoring Practices 1.2 patterns; custom roles are forbidden (`role="navigation"`, `role="dialog"`, etc. — never `role="my-widget"`). Live regions (`aria-live="polite"` and `aria-live="assertive"`) are used sparingly — at most three live regions per page (status + alert + log).

Live-region announcements MUST be short, plain-language, and non-redundant (don't announce "selected" twice). The aria-live announcer service in `packages/ui-base/src/aria/announcer.ts` is the only sanctioned path to announce; direct `aria-live` attributes on arbitrary DOM nodes are an eslint failure.

### §1.5 — Colour + contrast: AA minimum, AAA on text dense surfaces

Text + UI controls meet WCAG 1.4.3 (text contrast 4.5:1) and 1.4.11 (non-text contrast 3:1) as a minimum. Text-dense surfaces (Inspect tree, Data panel, Cost breakdown grid, schedule list, Support ticket detail) MUST meet AAA 1.4.6 (7:1 text contrast). Marketing site MUST meet AA only.

Colour MUST NEVER be the sole conveyor of meaning (WCAG 1.4.1). A red error state always accompanies an icon + text label; a green success state always accompanies an icon + text label. Selection state in the canvas accompanies a geometry-fill overlay (not colour-only — outline + fill).

Colour-blindness friendliness: the canonical PRYZM purple `#6600FF` (per the preview-style contract [C18](C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md)) is paired with a hatch pattern or outline in any case where users might confuse it with a similar hue (e.g. red-purple deuteranopes). The preview style + selection style MUST pass through a colour-blindness lint.

### §1.6 — Motion + animation respect `prefers-reduced-motion`

Every animation MUST honour the CSS media query `prefers-reduced-motion: reduce`. When set:

- Decorative animations (panel-open easings, loading-spinner rotations) are reduced to a single 100-ms ease or omitted entirely
- Parallax + auto-rotating + auto-playing motion are halted
- Camera animations (e.g. fly-to-element on inspect-tree selection per [C27](C27-BIM3-INSPECT-MODEL.md)) snap to the destination without intermediate interpolation
- Toast notifications fade in instantly + remain on screen for a longer dwell (10 s vs 5 s default)

The reduce-motion flag is read once at boot + on `change` event; surfaces re-render with the appropriate alternative.

WCAG 2.3.3 (Animation from interactions, AAA) is an aspiration not a requirement. WCAG 2.3.1 (Three flashes or below threshold) is a strict requirement — no animation flashes faster than 3 Hz.

### §1.7 — Focus management discipline

Focus is a first-class state. The product MUST:

- Set focus on the natural starting point on every route change (the page's main heading or its first interactive element)
- Restore focus on modal close
- NOT move focus on background data loads (this surprises users)
- NOT call `.focus()` on hover events (a known anti-pattern that disorients screen-reader users)
- Use a single `focus-visible` polyfill / native rule for visual focus indication; keyboard focus is always visible, mouse focus is suppressed on click

`packages/ui-base/src/focus/` owns the focus-management primitives; CI checks for raw `.focus()` calls outside the sanctioned path.

### §1.8 — Forms: labels + descriptions + error semantics

Every form input MUST carry:

- A visible label (NOT placeholder-as-label; placeholder is permitted only as a hint, never the label)
- An `aria-describedby` linking to its description / hint text
- An `aria-invalid="true"` + `aria-errormessage` linkage when in error
- A `required` attribute (or `aria-required`) when required

Error messages MUST be specific ("Email must include @" not "Invalid email") and announced via `aria-live="assertive"` when they first appear on a previously-valid field.

### §1.9 — Headings + landmarks: a coherent document outline

Every page has exactly one `<h1>` and a coherent heading hierarchy (no `<h3>` without a parent `<h2>`). Landmarks (`<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>`) are present on every full-page surface. Modal dialogs use `<dialog>` or `role="dialog"` with `aria-labelledby` pointing to the modal title.

CI lint via `eslint-plugin-jsx-a11y` + `axe-core` enforces the outline.

### §1.10 — Documents (PDF + IFC + DXF + sheet exports) carry accessibility metadata

Generated documents MUST include accessibility metadata:

- **PDF** ([C29](C29-PDF-VECTOR-EXPORT.md)) — PDF/A-3 with Tagged PDF structure; every drawing element carries an alt-text reading equivalent (e.g. "Floor plan, Level 1 — bedroom · kitchen · living"). The PDF MUST be navigable by screen reader (heading structure + alt text for each viewport).
- **IFC** ([C25](C25-IFC-EXPORT-PRODUCTION.md)) — the IfcSpace + IfcZone + IfcRoom carry meaningful `LongName` + `Description` (not just internal slugs)
- **DXF / DWG** ([C32](C32-DXF-DWG-ROUND-TRIP.md)) — text annotations are real text entities (not rasterised); layers carry meaningful names
- **COBie** ([C35](C35-COBIE-FM-HANDOVER.md)) — facility-management terms use the standard COBie vocabulary

This is "accessibility of generated output", an under-attended dimension. PRYZM's stance: a deliverable is part of the product; an inaccessible deliverable degrades the customer's ability to share with sighted-impaired colleagues.

### §1.11 — Plugin UI MUST meet the same bar

Plugins (per [C07](C07-PLUGIN-SDK-AND-MARKETPLACE.md)) emit UI through the L6 SDK surface; the SDK exposes accessibility primitives (label · description · live region · focus management) that plugins MUST use. Plugins that bypass the primitives (raw DOM with no aria attributes, custom focus management) FAIL the marketplace curation check per [C40 §1.11](C40-MARKETPLACE-ECONOMICS.md).

The SDK's `Button`, `Input`, `Modal`, `Tab`, `Tree` etc. compose the accessibility primitives in; plugin authors who use the primitives get accessibility for free. The marketplace review team verifies via `axe-core` on the published plugin's component-shell fixture.

### §1.12 — Accessibility issues are tracked + remediated on a calendar

Every accessibility issue (filed by a customer, surfaced by an audit, caught by CI) is recorded in the accessibility tracker (Linear project `A11Y` per §5.7) with a severity per the WAI-ARIA severity scale (`critical` · `serious` · `moderate` · `minor`). Targets:

| Severity | Target |
|---|---|
| critical (blocks task completion) | 5 business days |
| serious (significant friction) | 30 days |
| moderate (workaround possible) | 90 days |
| minor (cosmetic) | next major release |

Misses are escalated to the head of product. The remediation cycle ends with re-test via the same harness that caught the issue.

### §1.13 — Annual external accessibility audit

PRYZM commissions an external WCAG 2.2 audit by an accredited firm (Deque · TPG · etc.) every 12 months. The audit's findings are published in the accessibility statement (`pryzm.app/accessibility`) with remediation timelines. Material findings (`critical` or `serious`) MUST be closed within 90 days of the audit report or the timeline + interim mitigations published publicly.

### §1.14 — VPAT publication

A Voluntary Product Accessibility Template (VPAT 2.5 INT) MUST be published quarterly at `pryzm.app/vpat`. It records WCAG conformance per criterion (Supports · Partially Supports · Does Not Support · Not Applicable). Customers procuring PRYZM for accessibility-sensitive contexts (UK government, US Section 508, EU EN 301 549) consume the VPAT as a procurement gate.

### §1.15 — Every accessibility violation emits a span

Per P8:

- `pryzm.a11y.violation.detected` — `{ surface, ruleId, severity, count }` (from CI axe-core OR runtime monitoring)
- `pryzm.a11y.violation.remediated` — `{ surface, ruleId, ticketId, fixedAt }`
- `pryzm.a11y.audit.published` — `{ auditDate, auditorName, criticalCount, seriousCount, moderateCount, minorCount }`
- `pryzm.a11y.user.reportedIssue` — `{ surface, severity, summaryHash }`

Spans MUST open at the public boundary of `packages/a11y/` (the runtime monitoring layer).

---

## §2 — Schema (in `packages/schemas/src/a11y/`)

L0-pure. No I/O, no THREE, no DOM.

### §2.1 — Top-level types

| Schema | Owns |
|---|---|
| `WCAGCriterion` | `{ id: WCAGId, level: 'A' \| 'AA' \| 'AAA', name, principle: 'perceivable' \| 'operable' \| 'understandable' \| 'robust' }` |
| `WCAGId` | Branded string matching `^[1-4]\.[0-9]+\.[0-9]+$` (e.g. `1.4.3`, `2.4.7`) |
| `ConformanceStatus` | `'supports' \| 'partially_supports' \| 'does_not_support' \| 'not_applicable'` |
| `SurfaceA11yReport` | `{ surface: string, criterion: WCAGId, status: ConformanceStatus, notes?, lastTestedAt }` |
| `A11yIssue` | `{ id, surface: string, ruleId: AxeRuleId, severity: 'critical' \| 'serious' \| 'moderate' \| 'minor', filedAt, filedBy: 'ci' \| 'audit' \| 'customer' \| 'qa', linearTicketId, remediatedAt? }` |
| `AxeRuleId` | string — axe-core's stable identifier (e.g. `color-contrast`, `aria-required-attr`) |
| `AccessibilityStatement` | `{ publishedAt, applicableStandards: ('WCAG-2.2-AA' \| 'WCAG-2.2-AAA' \| 'EN-301-549' \| 'Section-508')[], overallConformance: ConformanceStatus, knownLimitations: string[], contactEmail }` |
| `VPATEntry` | `{ criterionId: WCAGId, conformance: ConformanceStatus, remarks: string }` |
| `VPAT` | `{ version: '2.5-INT', publishedAt, entries: VPATEntry[] }` |
| `AuditReport` | `{ id, auditorName, auditedAt, scope: string[], findings: AuditFinding[], publishedAt? }` |
| `AuditFinding` | `{ id, criterion: WCAGId, severity, description, recommendedFix, surfaces: string[], status: 'open' \| 'remediated' \| 'accepted_risk' }` |
| `KeyboardShortcut` | `{ id, surface, key, modifiers: ('Ctrl'\|'Alt'\|'Shift'\|'Meta')[], action: string, description }` (registered per tool) |
| `LiveRegionAnnouncement` | `{ surface, message, politeness: 'polite' \| 'assertive', emittedAt }` |

### §2.2 — Field-level constraints

| Field | Constraint |
|---|---|
| `WCAGId` | matches `^[1-4]\.[0-9]+\.[0-9]+$` |
| `SurfaceA11yReport.notes` | max 1000 chars; required when status != `supports` |
| `A11yIssue.severity` | unchanged after `remediatedAt`; severity escalation requires a new issue |
| `VPATEntry.remarks` | required when conformance != `supports`; max 500 chars |
| `KeyboardShortcut.key` | a single key code per W3C UI Events KeyboardEvent.code spec |

### §2.3 — Reserved surfaces

| Surface | Owns |
|---|---|
| `editor.canvas` | The 3D canvas itself — bounded responsibility per §1.2 |
| `editor.panel.<name>` | Property panel, Create panel, Inspect tree, Data panel, Cost panel, Schedule panel |
| `editor.modal.<name>` | Apartment-layout modal, Override modal, Confirm modals, Plan-comparison modal |
| `editor.shell` | Top bar, side rail, status bar, command palette |
| `marketing.<page>` | Landing, pricing, docs-site pages |
| `developer.dashboard.<section>` | Overview, artefacts, sales, payouts, etc. |
| `admin.<section>` | Curation queue, support tooling, telemetry dashboard |
| `auth.<flow>` | Signup, signin, password reset, SSO redirect |
| `billing.<page>` | Plan management, payment method, invoice history |
| `support.<surface>` | Help search, ticket list, ticket detail, status page |

---

## §3 — Stores

### §3.1 — `A11yIssueTrackerStore` (`packages/a11y/src/issueTracker.ts`)

Client-side optional + server-side authoritative. Holds the `A11yIssue` set. Syncs with the Linear `A11Y` project (per §5.7) via a webhook.

### §3.2 — `SurfaceConformanceStore` (`packages/a11y/src/conformanceStore.ts`)

Server-side. Holds the `SurfaceA11yReport` per (surface × criterion). Re-computed nightly from CI axe-core results + manual QA test runs. Feeds the VPAT generator.

### §3.3 — `AnnouncerService` (`packages/ui-base/src/aria/announcer.ts`)

Client-side. Singleton service that owns the `aria-live` regions on the page. Components call `announce({ message, politeness })` instead of writing direct DOM nodes.

### §3.4 — `KeyboardRegistry` (`packages/ui-base/src/keyboardRegistry.ts`)

Client-side. Per-surface keyboard shortcut registry. Every tool registers its shortcuts at composition time; the registry feeds:

- Conflict detection (two tools binding the same key in the same surface)
- The "Show keyboard shortcuts" cheat-sheet (gated to `?` key)
- The accessibility audit surface

### §3.5 — Persistence

Client-side stores are session-scoped. Server-side conformance + issue stores persist in PostgreSQL.

### §3.6 — Boundary monitoring

```
client boot:
   │
   ▼  registerAccessibilityObserver():
   │     - prefers-reduced-motion media query listener
   │     - prefers-color-scheme listener (light / dark — see §1.5)
   │     - focus-visible class polyfill
   │     - lang attribute observer (announces language changes per §1 + C46)
   │
   ▼  on every panel mount:
   │     - axe-core runtime audit (subset; perf-bounded)
   │     - violations → fire pryzm.a11y.violation.detected span
   │     - no UI surfacing (avoid pestering users); ops surface only
```

---

## §4 — Commands

All commands route through `commandBus` per P6 + [C16](C16-COMMAND-AUTHORING-PROTOCOL.md). All open OTel spans per §1.15.

### §4.1 — User-facing

| Command | Effect |
|---|---|
| `a11y.reportIssue` | Customer surfaces an accessibility issue via a "Report an accessibility issue" link in the footer; opens a typed-form modal; creates a `SupportTicket` with severity TIER-1 routing |
| `a11y.viewStatement` | Open the published accessibility statement |
| `a11y.viewVPAT` | Open the current VPAT (PDF download or HTML view) |
| `a11y.toggleKeyboardCheatsheet` | Open the keyboard-shortcut cheat-sheet modal |
| `a11y.toggleHighContrast` | Toggle the high-contrast theme (AAA aspiration; see §10 OQ-3) |

### §4.2 — Admin / sales-ops-facing

| Command | Effect |
|---|---|
| `a11y.runFullAudit` | Trigger an admin-side full-surface axe-core sweep; results persist to `SurfaceConformanceStore` |
| `a11y.publishStatement` | Admin — publish or update the accessibility statement |
| `a11y.publishVPAT` | Admin — generate + publish a new VPAT version (quarterly cadence enforced) |
| `a11y.recordAuditReport` | Admin — record a third-party audit; findings populate the issue tracker |
| `a11y.remediateIssue` | Admin — mark an issue as `remediated` (closes the issue + verification step required) |

### §4.3 — Server-only

| Command | Effect |
|---|---|
| `a11y.runCIAudit` | CI — every PR runs axe-core on the changed surfaces (or all surfaces nightly); violations fail the merge |
| `a11y.runQuarterlyVPATBuild` | Cron — every quarter, the VPAT is regenerated from current conformance + reviewed by an accessibility lead before publish |
| `a11y.alertCriticalOverdue` | Daily cron — fires when any `critical` issue is past its 5-business-day target |

---

## §5 — UI

### §5.1 — Keyboard-shortcut cheat-sheet

Triggered by `?` (or `Ctrl + /`). Modal lists every shortcut for the current surface, grouped by tool. Searchable. Per [C44](C44-MOBILE-AND-TABLET.md), mobile renders the equivalent gesture cheat-sheet.

### §5.2 — Accessibility settings page

`apps/editor/src/ui/settings/accessibility/` — gated to authenticated users. Renders:

- High-contrast toggle (when AAA elevation lands; see §10)
- Reduced-motion preference (read-only display of the OS-level pref + an override toggle)
- Font-size scale (1.0 / 1.25 / 1.5)
- Cheat-sheet always-on toggle (renders cheat-sheet as a permanent overlay)
- "View the accessibility statement" link
- "Report an accessibility issue" CTA

### §5.3 — Accessibility statement (public)

Hosted at `pryzm.app/accessibility`. Generated from the `AccessibilityStatement` record + the latest `AuditReport`. Carries:

- Applicable standards (WCAG 2.2 AA + EN 301 549 + Section 508 commitments)
- Overall conformance status
- Known limitations (3D canvas bounded responsibility per §1.2; specific surfaces under remediation)
- VPAT download link
- "Report an accessibility issue" contact (`accessibility@pryzm.app` + the in-product `a11y.reportIssue` flow)
- Date of last external audit + the audit report's executive summary

### §5.4 — VPAT page

`pryzm.app/vpat` — a versioned table view per quarter; downloadable in HTML + PDF + Word formats (Word is procurement standard).

### §5.5 — Live-region surface

Three persistent live regions on every full-page surface:

- `#a11y-status` — `aria-live="polite"`, used for command outcomes ("Wall created", "Project saved")
- `#a11y-alert` — `aria-live="assertive"`, used for errors and warnings
- `#a11y-log` — `aria-live="polite", aria-atomic="false"`, used for ongoing-task narration (e.g. AI generation progress)

Live regions are owned by the `AnnouncerService`; no surface writes to them directly.

### §5.6 — Accessibility-issue report modal

Triggered by `a11y.reportIssue`. Form fields:

- Where did you encounter the issue? (dropdown of surfaces; or "Other — specify")
- What did you expect to happen?
- What happened instead?
- Optional: your assistive technology (screen reader name + version)
- Submit → creates a `SupportTicket` with severity TIER-1 routing + the `a11y` tag

### §5.7 — Linear `A11Y` project mirror

Every `A11yIssue` mirrors to the Linear `A11Y` project. The project board renders per-severity columns + per-criterion swimlanes; the head of product reviews weekly.

### §5.8 — Keyboard surface (for accessibility-specific actions)

| Key | Effect |
|---|---|
| `?` or `Ctrl + /` | Open keyboard cheat-sheet |
| `Alt + 1` | Skip-link to main content (first interactive element on `<main>`) |
| `Alt + 2` | Skip-link to side nav |
| `Esc` (in modal) | Close modal + restore focus |

The skip-links are visually hidden until focused (a standard pattern — visible to keyboard users, invisible to mouse users).

---

## §6 — CI gates

| Gate | Path | What it checks |
|---|---|---|
| `check-axe-no-violations` | `tools/ga-gate/check-axe-no-violations.ts` | `axe-core` runs against every surface route + every component-fixture in `packages/ui-base/__fixtures__/`; ZERO `critical` or `serious` violations allowed; `moderate` + `minor` permitted with linked issue |
| `check-jsx-a11y-eslint` | `eslint-plugin-jsx-a11y` baseline rules | Every JSX file passes the `jsx-a11y/recommended` rule set |
| `check-aria-live-via-announcer` | `tools/ga-gate/check-aria-live-via-announcer.ts` | No raw `aria-live` attribute outside `packages/ui-base/src/aria/`; the announcer is the only path (per §1.4) |
| `check-keyboard-registry-coverage` | `tools/ga-gate/check-keyboard-registry-coverage.ts` | Every tool registered in `ToolRegistry` has at least one keyboard shortcut registered (per §1.3) |
| `check-focus-via-managed` | `tools/ga-gate/check-focus-via-managed.ts` | No raw `.focus()` calls outside `packages/ui-base/src/focus/` |
| `check-color-contrast` | `tools/ga-gate/check-color-contrast.ts` | Every `(foreground, background)` pair in the theme token system meets AA contrast (4.5:1 text; 3:1 non-text) |
| `check-prefers-reduced-motion` | `tools/ga-gate/check-prefers-reduced-motion.ts` | Every CSS / Framer Motion animation has a reduced-motion fallback declared |
| `check-form-labels` | `tools/ga-gate/check-form-labels.ts` | Every `<input>` / `<textarea>` / `<select>` either has a `<label>` association or a non-empty `aria-label` |
| `check-heading-outline` | `tools/ga-gate/check-heading-outline.ts` | Every route renders exactly one `<h1>` and a valid heading outline |
| `check-vpat-quarterly` | scheduled job | A new VPAT version published every 90 days; misses alert the head of product |
| `check-critical-issue-sla` | scheduled job | Every `A11yIssue.severity = 'critical'` resolved within 5 business days (per §1.12) |
| `check-a11y-schemas-pure` | extends schema-purity check | `packages/schemas/src/a11y/` has zero I/O, zero THREE, zero DOM (per P5) |
| `check-a11y-spans` | extends `check-spans.ts` | Every public `packages/a11y/` boundary function carries an OTel span (per §1.15) |
| `check-plugin-uses-ui-base-a11y` | `tools/ga-gate/check-plugin-uses-ui-base-a11y.ts` | Plugins MUST consume aria primitives via the L6 SDK; raw DOM with custom aria-* is flagged (per §1.11) |

### §6.2 — Conformance suites (criterion-by-criterion)

Every WCAG 2.2 Level AA criterion has a per-surface test in `packages/a11y/__tests__/criteria/<id>/`:

| Criterion family | Path | Covers |
|---|---|---|
| 1.1 Non-text content | `criteria/1.1/` | Images have alt; decorative images `alt=""`; complex images have long descriptions |
| 1.3 Info + Relationships | `criteria/1.3/` | Headings + lists + tables semantically marked; reading order matches visual order |
| 1.4 Distinguishable | `criteria/1.4/` | Contrast; resize text 200%; images of text minimal |
| 2.1 Keyboard accessible | `criteria/2.1/` | Every action via keyboard; no trap; no timing-dependent input |
| 2.4 Navigable | `criteria/2.4/` | Skip links; page title; focus order; link purpose; multiple ways; headings + labels descriptive; focus visible |
| 2.5 Input modalities | `criteria/2.5/` | Pointer gestures avoidable; pointer cancellation; label-in-name; motion-actuation avoidable |
| 3.1 Readable | `criteria/3.1/` | `lang` attribute; locale handling per C46 |
| 3.2 Predictable | `criteria/3.2/` | No focus-on-change context shift; consistent navigation; consistent identification |
| 3.3 Input assistance | `criteria/3.3/` | Error identification; labels + instructions; error suggestion; error prevention |
| 4.1 Compatible | `criteria/4.1/` | Valid markup; name + role + value for every component; status messages via aria-live |

Each criterion test runs against the surface manifest from §2.3.

---

## §7 — NFT targets

| NFT | Target | Bench |
|---|---|---|
| axe-core runtime audit per panel mount | < 50 ms | `axe-runtime.bench.ts` (new) |
| CI axe-core full sweep (every surface) | < 8 min in CI | `ci-axe-full.bench.ts` (new) |
| AnnouncerService announce latency | < 100 ms from emit to aria-live update | `announcer-latency.bench.ts` (new) |
| Keyboard cheat-sheet open | < 100 ms | `cheatsheet-open.bench.ts` (new) |
| VPAT generation (90 criteria × 30 surfaces) | < 30 s | `vpat-build.bench.ts` (new) |
| Reduced-motion media-query response | < 16 ms (one frame) | `reduced-motion-response.bench.ts` (new) |

---

## §8 — Migration plan

### §8.1 — New package `packages/a11y/`

```
packages/a11y/
  src/
    index.ts                       — composeA11y() boundary
    issueTracker.ts                — A11yIssueTrackerStore
    conformanceStore.ts            — SurfaceConformanceStore
    runtimeMonitor.ts              — boot-time observer (reduced-motion, lang, focus-visible)
    vpat/
      generator.ts                 — VPAT builder
      publisher.ts                 — write to apps/docs-site/public/vpat
    statement/
      builder.ts                   — AccessibilityStatement builder
    linearSync.ts                  — webhook → Linear A11Y project
    schemas/                       — re-exports
```

Wired into `composeRuntime()` at L3. The `packages/ui-base/` package gains an `a11y/` sub-tree owning the announcer + the focus manager + the keyboard registry.

### §8.2 — Phased rollout

| Phase | Deliverable | Estimate |
|---|---|---|
| A11Y-α-1 | `packages/schemas/src/a11y/` + zod | 0.3 wk |
| A11Y-α-2 | `packages/ui-base/src/aria/announcer.ts` + adopt across editor shell | 0.5 wk |
| A11Y-α-3 | `packages/ui-base/src/focus/` + adopt across editor shell | 0.5 wk |
| A11Y-α-4 | `packages/ui-base/keyboardRegistry.ts` + tool-by-tool registration | 1 wk |
| A11Y-β-1 | axe-core CI integration + baseline of violations + remediation push for `critical` + `serious` | 2 wk |
| A11Y-β-2 | `jsx-a11y` eslint config + sweep for low-hanging-fruit | 1 wk |
| A11Y-β-3 | Form-label sweep + heading-outline sweep | 1 wk |
| A11Y-β-4 | Color-contrast token audit + theme adjustments | 0.5 wk |
| A11Y-β-5 | Reduced-motion adoption across animations | 0.5 wk |
| A11Y-γ-1 | Accessibility statement + initial VPAT + publication infra | 1 wk |
| A11Y-γ-2 | Keyboard cheat-sheet UI + accessibility settings page | 0.5 wk |
| A11Y-γ-3 | Report-an-issue flow + Linear sync | 0.5 wk |
| A11Y-γ-4 | First external audit + remediation cycle | 4 wk (incl. auditor time) |
| A11Y-δ-1 | Plugin SDK accessibility primitives + marketplace curation gate | 1 wk |
| A11Y-δ-2 | PDF + IFC + DXF + COBie accessibility metadata wiring (cross-cuts C25/C29/C32/C35) | 2 wk |
| A11Y-δ-3 | CI gates (§6) all green | 0.5 wk |

**Total: ~16 wk** (longer than other Phase 6.3 contracts because the audit + remediation cycle is calendar-bound).

### §8.3 — Backward compatibility

The accessibility sweep does not break existing functionality — it only adds attributes + ensures keyboard surfaces exist + tightens semantics. Customers with assistive tech already have a partial experience; the sweep raises the floor.

### §8.4 — Test plan

Per [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) test convention. Every criterion + every surface has a vitest suite. End-to-end manual QA pass with screen-reader-of-record (NVDA + Windows for Mid-firm coverage; VoiceOver + macOS for design-firm coverage; TalkBack + Android for mobile per [C44](C44-MOBILE-AND-TABLET.md)) at each release.

---

## §9 — What is NOT in this contract

- **3D canvas full screen-reader narration** — explicitly out per §1.2. The narration is via the property panel + the inspect tree.
- **Voice control / dictation** — out of scope; users with motor-impairments using Dragon NaturallySpeaking / VoiceControl rely on the keyboard surface working, which §1.3 guarantees.
- **Cognitive accessibility (WCAG 3 stable when published)** — aspirational. The contract targets WCAG 2.2 AA; WCAG 3.0's cognitive recommendations are a future track.
- **Sign-language interpretation in product videos** — out of scope (no synchronized media in the editor; marketing videos may add ASL on case-by-case basis).
- **Braille output** — out of scope. Screen readers handle braille refreshable displays via their normal API; PRYZM does not author a separate braille track.
- **Low-vision-specific magnification beyond browser zoom** — the product respects browser zoom up to 200 % (WCAG 1.4.4); higher-zoom workflows rely on OS magnifier.
- **Mobile + tablet-specific gesture-driven accessibility** — covered by [C44](C44-MOBILE-AND-TABLET.md) with explicit cross-reference.
- **Internationalisation reading-order + RTL** — covered by [C46](C46-I18N-AND-L10N.md) with explicit cross-reference.
- **Browser + AT compatibility matrix** — covered by [C45](C45-BROWSER-AND-DEVICE-MATRIX.md).
- **Plugin-specific accessibility content** — plugin authors own their own UI accessibility under §1.11; PRYZM provides primitives + audit, not per-plugin remediation.

---

## §10 — Open questions (DRAFT-stage)

1. **High-contrast theme adoption**. §5.2 lists a toggle. Decision pending whether to ship a Windows-high-contrast-compatible theme (auto-detected via `prefers-contrast: more`) AND a PRYZM-branded high-contrast (orange / black). High-contrast is AAA, not AA.
2. **AAA elevations on text-dense surfaces**. §1.5 raises text-dense surfaces (Inspect, Data, Cost, Schedule, Support) to AAA 7:1 contrast. That's an ambitious commitment that constrains the theme palette. Validate with design before locking.
3. **Plugin curation gate**. §1.11 says the marketplace fails plugins that bypass the SDK accessibility primitives. The gate's exact bar (e.g. "zero axe-core critical / serious violations on the shipped component fixtures") needs design feedback before implementation.
4. **PDF accessibility depth**. Tagged PDF + reading order is the baseline; full PDF/UA conformance (a stricter spec) is a stretch goal. Decision pending whether to target PDF/UA in C29.
5. **3D canvas + the "blind architect" persona**. §1.2 describes a bounded responsibility. Is there a workflow where a blind architect can lead (not collaborate with sighted) a project? Possible answer: yes via the property panel + a more elaborate inspect-tree, but the workflow's economics are TBD. Future track.
6. **WCAG 2.2 new criteria (2.5.7 dragging movements, 2.5.8 target size minimum 24x24, 3.2.6 consistent help, 3.3.7 redundant entry, 3.3.8 accessible authentication)** — most apply to PRYZM without special effort; 2.5.7 (dragging) is non-trivial for the canvas (every element drag needs a keyboard alternative — partially covered by the command palette + property panel). Sweep separately.
7. **Customer-facing accessibility report on every project**. Idea: a per-project a11y report that shows whether the project's deliverables (sheets, schedules, IFC) meet accessibility metadata standards (per §1.10). Would help architects deliver to government-procurement contexts. Big scope; defer.
8. **Auditor selection**. Deque, TPG, AbilityNet — which firm in year 1? Trade-off on cost + depth + reputation. Sales / procurement input needed.

---

## §11 — Cross-reference summary

| Contract | Relationship |
|---|---|
| [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) | P6 — every a11y mutation through commandBus; schemas L0-pure |
| [C04](C04-RENDERING-AND-SCHEDULING.md) | Reduced-motion impacts rendering scheduling; 3D canvas bounded-responsibility statement aligned |
| [C06](C06-UI-SHELL-AND-TOOLS.md) | UI shell hosts the live regions + the focus manager + the keyboard registry |
| [C07](C07-PLUGIN-SDK-AND-MARKETPLACE.md) | Plugin SDK exposes accessibility primitives plugins MUST use |
| [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) | P8 spans for a11y violations + audits |
| [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) | All `a11y.*` commands follow the protocol |
| [C25](C25-IFC-EXPORT-PRODUCTION.md) | IFC exports carry accessibility metadata per §1.10 |
| [C27](C27-BIM3-INSPECT-MODEL.md) | The inspect tree is the screen-readable representation of the canvas |
| [C29](C29-PDF-VECTOR-EXPORT.md) | PDF/A-3 Tagged PDF accessibility metadata per §1.10 |
| [C40](C40-MARKETPLACE-ECONOMICS.md) | Curation gate enforces plugin SDK accessibility-primitive consumption |
| [C42](C42-CUSTOMER-SUPPORT-TIER.md) | Accessibility issues routed via support; TIER-1 routing |
| [C44](C44-MOBILE-AND-TABLET.md) | Sibling — mobile + tablet gesture accessibility variance |
| [C45](C45-BROWSER-AND-DEVICE-MATRIX.md) | Sibling — screen-reader × browser × OS matrix |
| [C46](C46-I18N-AND-L10N.md) | Sibling — lang attribute + RTL + locale-aware reading order |

---

*End — C43 Accessibility (WCAG 2.2 AA), 2026-06-01 — DRAFT.*
