# C46 — Internationalisation (i18n) & Localisation (L10n)

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: governs **internationalisation** (the engineering shape — externalised strings, lang attributes, RTL-ready layouts, locale-aware formatting) and **localisation** (the linguistic shape — translated copy + locale-specific content rendering). Codifies the supported-locale matrix, the architectural-units doctrine (metric SI vs. imperial), the RTL layout policy, the date / number / currency / measurement formatting rules via `Intl`, the translation-source-of-truth (a single `messages/` directory per app with one JSON per locale), the translation workflow (vendor or community), the language-switching surface, the AI host's locale-aware prompting strategy, and the IFC export's locale-aware property naming. **Architectural units are the highest-stakes locale concern in BIM** — the product MUST distinguish "the user's display preference" (locale.measurementSystem) from "the project's authoring unit" (`Project.unitSystem`), and they MAY differ.
> **Depends on**: [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) (schemas L0-pure — locale records are schemas), [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md) (`.pryzm` carries authoring unit not user locale; locale ≠ stored value), [C06](C06-UI-SHELL-AND-TOOLS.md) (UI shell hosts the locale switcher + RTL layout root), [C25](C25-IFC-EXPORT-PRODUCTION.md) (IFC export's unit declaration + Pset internationalisation), [C43](C43-ACCESSIBILITY.md) (lang attribute + locale-aware reading order; AT respects locale), [C44](C44-MOBILE-AND-TABLET.md) (RTL on mobile), [C45](C45-BROWSER-AND-DEVICE-MATRIX.md) (browser locale detection).
> **Sibling**: [C43](C43-ACCESSIBILITY.md), [C44](C44-MOBILE-AND-TABLET.md), [C45](C45-BROWSER-AND-DEVICE-MATRIX.md).
> **Downstream**: per-locale message bundles · translation-vendor workflow · the AI host's per-locale system prompts · IFC export adaptation · sheet templates (title block per locale's drawing convention) · pricing pages per locale · customer-support per locale · trust-report per locale.
> **Key principles**: **P5** (locale schemas L0-pure), **P6** (locale-switching is a command), **P8** (every locale switch + every translation-miss emits a span), **P0.3** (translation packs may be marketplace artefacts — community-authored translations are a first-class artefact kind).
> **Master plan**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md §13 (Phase 6.3 accessibility & device)](../03-execution/plans/master-implementation-plan.md).
> **Audit-source**: [MISSING-CONTRACTS-AUDIT-2026-06-01.md §3.4](../MISSING-CONTRACTS-AUDIT-2026-06-01.md).

---

## §1 — Invariants

### §1.1 — Architectural units are project-authored, not user-locale-displayed

The single highest-stakes locale concern in BIM: **the displayed unit is NOT the stored unit**. PRYZM stores every geometry value in SI metres (per [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md)). The user's display preference (metric vs. imperial) is a presentation-only transform applied at read.

A project may be AUTHORED in either system — the project carries `Project.unitSystem: 'metric' \| 'imperial'` which determines:

- The default tool input mode (the wall-create tool's length input defaults to metric for a metric project, imperial for imperial)
- The dimension annotation display in sheets
- The IFC export's unit declaration (`IfcSIUnit` vs. `IfcDerivedUnit`)
- The cost catalogue currency + unit hint (a USD project usually wants imperial-rate catalogues; a GBP project usually wants metric)

A user displaying a metric-authored project MAY choose to display dimensions imperially in their session preference; the project's authoring system remains metric and the IFC export remains metric. The session preference is per-(user × project) and persists.

The CI gate `check-no-imperial-in-storage` blocks any code path that persists a non-SI value to the `.pryzm` file.

### §1.2 — Eight locale tiers — the supported matrix

PRYZM supports the following locales:

| Locale | Language | Region | Tier | Notes |
|---|---|---|---|---|
| `en-US` | English (US) | North America | TIER 1 | Default; product authored here |
| `en-GB` | English (UK) | UK | TIER 1 | Same language; differs on units, spelling, drawing convention |
| `de-DE` | German | DE / AT / CH | TIER 1 | German-DE; AT + CH may need separate overrides |
| `fr-FR` | French | FR / BE / CH | TIER 1 | French-FR; LU + Africa may need overrides |
| `ja-JP` | Japanese | JP | TIER 1 | Vertical-text concerns out of scope; horizontal only |
| `es-ES` | Spanish (Spain) | ES | TIER 2 | LatAm Spanish (es-MX, es-AR) is a separate tier |
| `pt-BR` | Portuguese (Brazil) | BR | TIER 2 | European Portuguese (pt-PT) is a separate tier |
| `zh-CN` | Chinese (Simplified) | CN | TIER 2 | Simplified Han; zh-TW + zh-HK Traditional is separate |
| `ar-SA` | Arabic | SA | TIER 3 (RTL) | RTL; pilot before TIER 2 promotion |
| `he-IL` | Hebrew | IL | TIER 3 (RTL) | RTL; pilot |

TIER 1 commits to first-class translation maintenance (the product team owns + reviews); TIER 2 ships with community + vendor translation, with PRYZM warranty on accuracy of architectural terms only; TIER 3 is preview / pilot — the surface works but translation completeness varies.

New locales require an ADR with a sponsor (regional sales / customer demand) + a translation plan (vendor + budget).

### §1.3 — Translation strings live in `messages/<locale>.json` per app

Every app (`apps/editor`, `apps/docs-site`, `apps/admin-tools`, etc.) carries a `messages/` directory:

```
apps/editor/
  messages/
    en-US.json        — the source-of-truth (English-US)
    en-GB.json        — overrides only (different from en-US)
    de-DE.json
    fr-FR.json
    ja-JP.json
    es-ES.json
    pt-BR.json
    zh-CN.json
    ar-SA.json
    he-IL.json
```

The `en-US.json` is the BASELINE — every other locale is checked at CI for missing keys against it. Keys missing in a TIER 1 locale FAIL CI; keys missing in a TIER 2 locale produce a warning; TIER 3 locales fall back to `en-US` silently.

The JSON schema:

```json
{
  "editor.tool.wall.label": {
    "message": "Wall",
    "description": "Tool label for the wall-creation tool",
    "context": "noun, building element"
  },
  "editor.modal.apartment-layout.headline": {
    "message": "Generate apartment layout",
    "description": "Modal title"
  }
}
```

The `description` + `context` fields are for translators (architectural terminology has many false-friend traps; "wall" ≠ "Mauer" for a freestanding wall vs. "Wand" for a building wall — the description disambiguates).

### §1.4 — `Intl` is the formatter; no homegrown formatting

Every locale-dependent formatting (date, time, number, currency, list, ordinal, plural, unit) MUST flow through the `Intl` API. The contract enumerates the allowed formatters:

```ts
Intl.DateTimeFormat       // date + time
Intl.NumberFormat         // numbers + currency + percent + units
Intl.PluralRules          // singular / plural / few / many
Intl.ListFormat           // "A, B, and C" / "A, B oder C"
Intl.Collator             // locale-aware sorting
Intl.RelativeTimeFormat   // "2 hours ago"
Intl.Segmenter            // locale-aware word + sentence boundaries (Japanese, Chinese)
Intl.DisplayNames         // language + region + currency + script names
```

CI lint `check-intl-only` flags any homegrown string formatting (e.g. `${num}m` for "10 metres" — should be `Intl.NumberFormat(locale, { style: 'unit', unit: 'meter' })`).

### §1.5 — RTL is a layout direction, not a content reversal

For Arabic + Hebrew (TIER 3 RTL):

- The HTML root element carries `dir="rtl"` on RTL locales
- CSS uses logical properties (`margin-inline-start`, `padding-block-end`, `inset-inline-start`) NOT physical (`margin-left`, etc.) for every locale-sensitive surface
- Icons that have inherent directionality (back-arrow, forward-arrow) flip on RTL
- 3D canvas content does NOT flip (a building's geometry is locale-independent)
- Drawing sheets follow [C34](C34-PRINT-AND-DRAWING-STANDARDS.md) — title-block conventions per regional drawing standards
- Numbers MAY appear in either-direction depending on locale convention (Arabic-Indic numerals vs. Western Arabic numerals — `Intl.NumberFormat` handles this)

Logical properties are the modern CSS approach + work in every Tier 1 browser per [C45](C45-BROWSER-AND-DEVICE-MATRIX.md). Existing physical-property CSS is sweep-migrated as part of the C46 rollout.

### §1.6 — Locale detection and fallback chain

The user's locale is determined in priority order:

1. **Explicit setting** — `Preference.locale` set in the user account
2. **Browser locale list** — `navigator.languages` (multiple may be set)
3. **Browser primary** — `navigator.language`
4. **IP geolocation hint** — used only when no other signal
5. **`en-US` default** — final fallback

On match against the supported matrix:

- If the user's preferred locale is TIER 1 + present in `messages/`, use it
- If the preferred is TIER 2, use it (warn on missing keys)
- If the preferred is TIER 3, use it with `en-US` per-key fallback
- If unsupported (e.g. `ko-KR` not yet shipped), fall back to the closest supported locale by language family (`ko-KR` → `ja-JP`? — no, `ja-JP` is too distant; fall back to `en-US`)

A `locale.suggestPromo` event fires when the user's preferred is unsupported but a nearby locale (same language family in the matrix) is available — surfacing the "do you want to try our German edition?" prompt.

### §1.7 — AI host MUST emit responses in the user's locale

The AI host (per [C09](C09-AI-AND-VISIBILITY-INTENT.md)) is locale-aware. The system prompt includes the user's locale; AI responses MUST be in that locale unless the user explicitly asks otherwise. Architectural terms in AI-generated content (room labels, plan-critique copy, cost-suggestion narratives) MUST use the locale-correct terminology.

Per-locale system-prompt extensions live in `ai-host/messages/<locale>.json` alongside the editor messages. A glossary file (`ai-host/messages/<locale>.glossary.json`) defines per-locale canonical architectural terms (wall, slab, door, room types in the apartment-layout workflow).

### §1.8 — IFC export's locale-awareness

The IFC export ([C25](C25-IFC-EXPORT-PRODUCTION.md)) emits unit declarations, Pset names, and entity labels that interact with locale:

- **Units** — `IfcUnitAssignment` MUST match the project's `unitSystem`, not the user's display preference (per §1.1)
- **Entity LongName** — for IfcSpace + IfcZone, the customer-provided label is used as-is (their language)
- **Pset name** — buildingSMART-standard Pset names (`Pset_WallCommon` etc.) are English-only; PRYZM does NOT translate them (industry convention)
- **Localised Pset extensions** — for custom Psets, the customer's locale-appropriate name MAY be used; the recommended pattern is to bundle the original name + a `LongName` translated property

This is consistent with IFC4X3 schema usage; no locale-specific transformations beyond the unit assignment.

### §1.9 — Currency display is locale + project-aware

For commerce surfaces ([C39](C39-PRICING-AND-PLAN-TIERS.md), [C40](C40-MARKETPLACE-ECONOMICS.md)):

- Subscription pricing MAY display in the customer's local currency (via Stripe Adaptive Pricing) — but the customer's account currency is fixed at Stripe checkout
- Cost catalogues ([C38](C38-COST-5D.md)) carry an explicit `currency` field; conversion is a separate action
- Display format follows `Intl.NumberFormat(locale, { style: 'currency', currency: 'GBP' })`

A user authoring a £-denominated project on a `de-DE` locale sees "10,50 £" (correct German formatting + GBP symbol). The currency value remains GBP; the format adapts.

### §1.10 — Date formats use ISO 8601 in storage; locale formats in display

All date storage in the `.pryzm` file + the database uses ISO 8601 (`YYYY-MM-DDTHH:mm:ssZ`). Display uses `Intl.DateTimeFormat`. This is the universal rule.

Sheet revision dates (per [C30](C30-DRAWING-SET-MANAGEMENT.md)) follow the project's chosen drawing standard's date convention (`DD.MM.YYYY` for DIN, `YYYY-MM-DD` for ISO 19650, etc.) — but the underlying storage is still ISO 8601.

### §1.11 — Every locale switch emits a span

Per P8:

- `pryzm.locale.detected` — `{ resolvedLocale, source: 'preference' \| 'navigator' \| 'ip_hint' \| 'fallback', preferredCandidates }` (one per session)
- `pryzm.locale.switched` — `{ from, to, reason: 'user' \| 'admin' \| 'jurisdiction_change' }`
- `pryzm.locale.translation_miss` — `{ locale, messageKey, tier }` (when a TIER 1/2 locale falls back to en-US for a key)
- `pryzm.locale.glossary_miss` — `{ locale, glossaryKey }` (when an architectural term is missing from the glossary)

Spans MUST open at the public boundary of `packages/i18n/`.

### §1.12 — Translation cost-control: AI-assisted, human-reviewed

The product's translation workflow:

1. **Source authoring** — `en-US.json` is the canonical source
2. **AI-assisted first-pass** — Claude (via a CI pipeline) translates new keys into each TIER 1 + TIER 2 locale with the source's `context` + `description` as guidance
3. **Human review** — a translator review (vendor or community) approves / corrects each AI-suggested string
4. **Glossary fork-out** — for architectural terms, the AI uses the per-locale `glossary.json` instead of generic translation
5. **CI gate** — keys flagged `humanReviewedAt < lastSourceModified` block merge for TIER 1; warn for TIER 2; ignored for TIER 3

This drives translation cost predictability + freshness. The marketplace P0.3 family-platform allows community-authored translations to publish as artefacts (per [C40](C40-MARKETPLACE-ECONOMICS.md)).

### §1.13 — Discipline-neutrality + cultural neutrality

The product MUST NOT presume the customer's discipline OR cultural perspective. Examples:

- Apartment layout terminology uses neutral terms (`kitchen` not `cocina-Mexicana` style); customers in MX get the same `kitchen` label, translated to `Cocina` via the standard message
- Date examples in onboarding use the user's locale, not a hardcoded "January 15"
- The product never assumes a non-Western day-of-week ordering convention
- Religious / political symbols are not used in iconography

### §1.14 — Translation files are append-only at the key level

A message key, once introduced, MUST NOT be renamed or removed in any locale's JSON — only `deprecated: true` + a `replacedBy?: string` field is added. The runtime resolver falls back to the replacement for any consumer still emitting the old key.

This prevents translation regression on customer screens during code-churn.

### §1.15 — Sheet drawing standards per locale

Drawing conventions per regional standard (per [C34](C34-PRINT-AND-DRAWING-STANDARDS.md)):

| Locale | Default standard |
|---|---|
| `en-US` | AIA + ANSI |
| `en-GB` | RIBA + BS |
| `de-DE` | DIN |
| `fr-FR` | NF + AFNOR |
| `ja-JP` | JIS |
| `es-ES` | UNE |
| `pt-BR` | ABNT |
| `zh-CN` | GB |
| `ar-SA` | SASO (where applicable) |
| `he-IL` | SI |

A customer's project carries an explicit `drawingStandard` field; locale only sets the default at project-creation. Switching the standard mid-project is supported via [C34](C34-PRINT-AND-DRAWING-STANDARDS.md) command.

---

## §2 — Schema (in `packages/schemas/src/i18n/`)

L0-pure. No I/O, no THREE, no DOM.

### §2.1 — Top-level types

| Schema | Owns |
|---|---|
| `LocaleId` | branded BCP-47 string — e.g. `'en-US'`, `'ja-JP'`, `'ar-SA'` |
| `LocaleTier` | `1 \| 2 \| 3` |
| `LocaleSpec` | `{ id: LocaleId, language: ISO639, region: ISO3166, tier: LocaleTier, isRTL: boolean, defaultUnitSystem: 'metric' \| 'imperial', defaultDrawingStandard: string }` |
| `LocaleRegistry` | `Record<LocaleId, LocaleSpec>` (compile-time constant) |
| `MessageKey` | branded string — `area.subarea.label` pattern |
| `MessageEntry` | `{ message: string, description?: string, context?: string, deprecated?: boolean, replacedBy?: MessageKey, humanReviewedAt?: ISOTimestamp }` |
| `MessageBundle` | `{ locale: LocaleId, entries: Record<MessageKey, MessageEntry> }` |
| `GlossaryEntry` | `{ source: string, target: string, partOfSpeech: 'noun' \| 'verb' \| 'adjective' \| 'phrase', context, alternateTargets?: string[] }` |
| `LocalePreference` | `{ userId: UserId, locale: LocaleId, unitSystemOverride?: 'metric' \| 'imperial', drawingStandardOverride?: string, setAt }` |
| `LocaleDetection` | `{ resolvedLocale: LocaleId, source, preferredCandidates: LocaleId[], fallbackChainApplied: boolean }` |
| `TranslationMiss` | `{ locale: LocaleId, messageKey: MessageKey, tier: LocaleTier, occurredAt }` |
| `Project.unitSystem` | `'metric' \| 'imperial'` (project-level, NOT locale-level) |
| `Project.drawingStandard` | `'AIA' \| 'RIBA' \| 'DIN' \| 'NF' \| 'JIS' \| 'UNE' \| 'ABNT' \| 'GB' \| 'SASO' \| 'SI' \| 'ISO19650'` |

### §2.2 — Field-level constraints

| Field | Constraint |
|---|---|
| `LocaleId` | matches BCP-47 (`/^[a-z]{2}(-[A-Z]{2})?$/`) |
| `MessageKey` | matches `^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$` |
| `MessageEntry.message` | non-empty after trim; max 5000 chars |
| `MessageEntry.description` | max 500 chars |
| `LocalePreference.unitSystemOverride` | per-(user × project); not per-account |
| `TranslationMiss` | recorded only for TIER 1 + TIER 2 keys; TIER 3 silent fallback is normal |

### §2.3 — Reserved message-key areas (per app)

| Area | Owns |
|---|---|
| `editor.*` | Editor UI strings (tools, panels, modals, banners) |
| `marketing.*` | Marketing-site strings |
| `auth.*` | Signup / signin / password-reset flow |
| `billing.*` | Plan management surfaces |
| `support.*` | Customer support strings |
| `admin.*` | Admin tooling |
| `developer.*` | Developer dashboard |
| `share-link.*` | Shared-link viewer |
| `ai.*` | AI-host surfaces + per-locale system prompts |

Per [C41](C41-TELEMETRY-AND-ANALYTICS.md), telemetry event names are NEVER translated (event names are technical identifiers).

---

## §3 — Stores

### §3.1 — `LocaleStore` (`packages/i18n/src/store.ts`)

Client-side. Holds the current session's `LocaleDetection` + `LocalePreference`. Reactive — components subscribe via `useLocale()` and `useTranslation(messageKey)`.

### §3.2 — `MessageBundleStore` (`packages/i18n/src/messageBundles.ts`)

Client-side. Holds loaded `MessageBundle` per locale. Lazy-loaded (the user's primary locale loads at boot; fallback locales lazy-load on first miss).

### §3.3 — `GlossaryStore` (`packages/i18n/src/glossary.ts`)

Client-side + server-side mirror. Per-locale architectural-term glossary; used by the AI host's translation pipeline.

### §3.4 — `LocalePreferenceStore` (server-side, `server/i18n/LocalePreferenceStore.ts`)

Server-side. Persists per-user (+ optionally per-project) locale preferences.

### §3.5 — `TranslationMissLedger` (server-side, `server/i18n/TranslationMissLedger.ts`)

Server-side append-only. Records every TIER 1 + TIER 2 translation miss for the translation team to address. Aggregated weekly.

### §3.6 — Persistence

`MessageBundle` files ship in the bundle (per-locale code-splitting). `LocalePreference` persists in PostgreSQL.

### §3.7 — Detection + resolution pipeline

```
boot:
   │
   ▼  read user account preference (highest priority)
   │     - present → set as resolvedLocale
   │
   ▼  if no preference:
   │     - read navigator.languages
   │     - find first that matches the supported matrix
   │     - emit pryzm.locale.detected with source: 'navigator'
   │
   ▼  if no match:
   │     - read IP-hint from server-side detection
   │     - emit pryzm.locale.detected with source: 'ip_hint'
   │
   ▼  if no match:
   │     - resolvedLocale = 'en-US'; fallbackChainApplied = true
   │     - emit pryzm.locale.detected with source: 'fallback'
   │
   ▼  load message bundle for resolvedLocale
   │     - lazy via dynamic import
   │
   ▼  if isRTL → set html dir="rtl"
   │
   ▼  resolve any locale.suggestPromo events
   │     - e.g. user is ko-KR but matrix lacks ko → suggest closest supported
```

---

## §4 — Commands

All commands route through `commandBus` per P6 + [C16](C16-COMMAND-AUTHORING-PROTOCOL.md). All open OTel spans per §1.11.

### §4.1 — User-facing

| Command | Effect |
|---|---|
| `locale.set` | Set the user's locale preference; updates `LocaleStore` + persists per [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md); UI re-renders |
| `locale.setUnitSystemOverride` | Per-project override of the display unit system |
| `locale.setDrawingStandardOverride` | Per-project override of the drawing standard |
| `locale.acceptPromo` | Accept a suggested-locale promo (e.g. "switch to de-DE") |
| `locale.dismissPromo` | Dismiss the suggestion |

### §4.2 — Admin / sales-ops-facing

| Command | Effect |
|---|---|
| `locale.publishBundle` | Publish a new `MessageBundle` for a locale (CI deploy or hot-reload depending on env) |
| `locale.markHumanReviewed` | Mark a message-key as human-reviewed at the current source revision |
| `locale.deprecate` | Mark a message-key `deprecated: true` + replacedBy |
| `locale.promoteTier` | Promote a locale TIER 3 → TIER 2 → TIER 1 (with sales / coverage justification) |

### §4.3 — Server-only

| Command | Effect |
|---|---|
| `locale.runAITranslate` | CI — translate new TIER 1 + TIER 2 keys via Claude; emits suggestion for human review |
| `locale.recordMiss` | Telemetry — record a TIER 1 or TIER 2 translation miss; aggregates weekly |
| `locale.suggestPromo` | Server-side — when a user's locale is unsupported but close, send the promo |

---

## §5 — UI

### §5.1 — Locale switcher

`apps/editor/src/ui/settings/i18n/` — a settings page with:

- Current locale displayed (`Intl.DisplayNames` to render "English (United States)")
- Dropdown of all supported locales (TIER 1, then TIER 2, then TIER 3 — tier-labelled subtly)
- Unit-system override toggle (per-project)
- Drawing-standard override (per-project, sourced from [C34](C34-PRINT-AND-DRAWING-STANDARDS.md))
- "What's new in this version of the translations" link
- Community-translation marketplace link (for community-authored locale packs)

### §5.2 — In-page locale indicator

The editor shell carries a small locale indicator (e.g. "EN-US ▾") in the top bar, click to switch. Hidden on screens < `phablet` form-factor (per [C44](C44-MOBILE-AND-TABLET.md)).

### §5.3 — RTL layout root

When `LocaleDetection.isRTL === true`, the root HTML element renders `dir="rtl"`. CSS uses logical properties throughout; visual testing per [C45](C45-BROWSER-AND-DEVICE-MATRIX.md) device fleet for the RTL locales.

The 3D canvas content does NOT flip (geometry is locale-independent). Text annotations within the canvas (e.g. dimension labels) DO use locale-appropriate scripts and digit formatting.

### §5.4 — "Switch to your locale" promo

When `locale.suggestPromo` fires (the user's preferred locale is unsupported but a close-language is available), a dismissible banner: "Switch to <suggested>? Some translations may be incomplete." Dismissable for the session.

### §5.5 — Missing-translation indicator (dev / admin only)

In development + for admins, untranslated TIER 1 keys render with a `[missing en-US]` prefix to flag during QA. Production builds remove this; missing keys silently fall back to `en-US`.

### §5.6 — Marketplace locale packs

A community-translated locale (per [C40](C40-MARKETPLACE-ECONOMICS.md) family-platform) installs as a "Locale pack" artefact. Activates a new locale or extends an existing one. Settings page lists installed packs + their authors + last-updated.

### §5.7 — Keyboard surface

Locale switching is keyboard-accessible via the settings page; no special locale-specific keyboard shortcuts.

---

## §6 — CI gates

| Gate | Path | What it checks |
|---|---|---|
| `check-message-key-registered` | `tools/ga-gate/check-message-key-registered.ts` | Every `useTranslation('key')` references a key present in `en-US.json` |
| `check-tier1-keys-translated` | `tools/ga-gate/check-tier1-keys-translated.ts` | Every key in `en-US.json` exists in every TIER 1 locale's bundle (de-DE, fr-FR, ja-JP, en-GB) |
| `check-tier1-keys-human-reviewed` | `tools/ga-gate/check-tier1-keys-human-reviewed.ts` | Every TIER 1 key carries `humanReviewedAt >= en-US.json's last source modify time` |
| `check-intl-only` | `tools/ga-gate/check-intl-only.ts` | No source file uses string concatenation for locale-dependent formatting (date, number, currency, plural) — must use `Intl` |
| `check-css-logical-properties` | `tools/ga-gate/check-css-logical-properties.ts` | No source file uses physical CSS properties (`margin-left`, etc.) in locale-sensitive UI components |
| `check-no-imperial-in-storage` | `tools/ga-gate/check-no-imperial-in-storage.ts` | No code path writes a non-SI value to the `.pryzm` file (per §1.1) |
| `check-key-not-renamed` | `tools/ga-gate/check-key-not-renamed.ts` | git-diff fails if a MessageKey is removed (vs deprecated + replacedBy) |
| `check-locale-detection-fallback` | runtime — boundary | Every locale resolution has a documented fallback path |
| `check-i18n-spans` | extends `check-spans.ts` | Every public `packages/i18n/` boundary function carries an OTel span (per §1.11) |
| `check-i18n-schemas-pure` | extends schema-purity check | `packages/schemas/src/i18n/` has zero I/O, zero THREE, zero DOM (per P5) |
| `check-message-keys-pattern` | runtime — schema validator | Every key matches the `area.subarea.label` regex (per §2.2) |
| `check-discipline-neutral-i18n` | manual review | No locale's translation introduces discipline-specific terminology (per §1.13) |

### §6.2 — Conformance suites

| Suite | Path | Asserts |
|---|---|---|
| Detection pipeline | `packages/i18n/__tests__/detection.test.ts` | Every (navigator-state × IP-hint × preference) tuple resolves correctly |
| `Intl.NumberFormat` use | `packages/i18n/__tests__/intl-number.test.ts` | Display rendering of metric / imperial dimensions correct per locale |
| RTL layout | `tests/e2e/rtl-layout.spec.ts` | Arabic + Hebrew locales render with logical-property layouts; no horizontal-flip of canvas content |
| Project-vs-locale unit | `packages/i18n/__tests__/unit-display.test.ts` | A metric-authored project displays imperially when override active; `.pryzm` storage remains SI |
| Translation memory | `packages/i18n/__tests__/translation-memory.test.ts` | AI-assisted suggestions consume the per-locale glossary correctly |
| Marketplace locale pack | `tests/e2e/marketplace-locale-pack.spec.ts` | Installing a community-translated pack extends the locale + activates correctly |
| Deprecation chain | `packages/i18n/__tests__/deprecation.test.ts` | A deprecated key with replacedBy resolves to the replacement |
| Drawing-standard mapping | `packages/i18n/__tests__/drawing-standard.test.ts` | Default drawing standard per locale matches the §1.15 table |

---

## §7 — NFT targets

| NFT | Target | Bench |
|---|---|---|
| Locale detection at boot | < 10 ms | `locale-detect.bench.ts` (new) |
| Message bundle load (per locale, ~5000 keys) | < 200 ms p95 | `bundle-load.bench.ts` (new) |
| `useTranslation` resolve (cached) | < 0.05 ms | `t-resolve-cached.bench.ts` (new) |
| RTL re-layout on locale switch | < 200 ms | `rtl-relayout.bench.ts` (new) |
| AI-assisted translation CI run (200 keys × 5 locales) | < 10 min | `ai-translate-ci.bench.ts` (new) |
| Glossary lookup | < 0.5 ms | inherited from registry budget |

---

## §8 — Migration plan

### §8.1 — New package `packages/i18n/`

```
packages/i18n/
  src/
    index.ts                       — composeI18n() boundary
    store.ts                       — LocaleStore
    detector.ts                    — multi-priority locale detection
    messageBundles.ts              — MessageBundleStore
    glossary.ts                    — GlossaryStore
    rtl.ts                         — RTL layout root manager
    useTranslation.ts              — main hook
    formatters/
      number.ts                    — wraps Intl.NumberFormat
      date.ts                      — wraps Intl.DateTimeFormat
      currency.ts                  — wraps Intl.NumberFormat with currency
      relativeTime.ts              — wraps Intl.RelativeTimeFormat
      list.ts                      — wraps Intl.ListFormat
      plural.ts                    — wraps Intl.PluralRules
    schemas/                       — re-exports
```

Wired into `composeRuntime()` at L3.

### §8.2 — Server-side: `server/i18n/`

```
server/i18n/
  LocalePreferenceStore.ts         — PG-backed
  TranslationMissLedger.ts         — PG append-only
  aiTranslateCron.ts               — AI-assisted translation pipeline
  bundlePublisher.ts               — publish new MessageBundle versions
  glossaryStore.ts                 — PG-backed glossary
```

### §8.3 — Phased rollout

| Phase | Deliverable | Estimate |
|---|---|---|
| I18N-α-1 | `packages/schemas/src/i18n/` + zod | 0.3 wk |
| I18N-α-2 | `packages/i18n/` detector + store + LocaleRegistry | 0.5 wk |
| I18N-α-3 | `messages/` directory + en-US baseline + `useTranslation` hook | 0.5 wk |
| I18N-α-4 | Sweep existing UI strings → message keys (large) | 3 wk |
| I18N-β-1 | `Intl` adoption sweep (date / number / currency / plural) | 1.5 wk |
| I18N-β-2 | CSS logical-properties sweep | 1.5 wk |
| I18N-β-3 | TIER 1 locales: en-GB + de-DE + fr-FR + ja-JP — AI-translated + human-reviewed | 3 wk |
| I18N-β-4 | RTL layout root + Arabic / Hebrew pilot (TIER 3) | 1.5 wk |
| I18N-γ-1 | AI host locale-aware system prompts + glossary | 1 wk |
| I18N-γ-2 | IFC export locale-awareness | 0.5 wk |
| I18N-γ-3 | Currency display + Stripe Adaptive Pricing wiring | 0.5 wk |
| I18N-γ-4 | Marketplace locale pack runtime | 1 wk |
| I18N-γ-5 | Locale switcher + RTL settings + promos | 0.5 wk |
| I18N-δ-1 | CI gates (§6) all green | 0.5 wk |

**Total: ~16 wk** (longest single contract — the sweep across the existing codebase is huge).

### §8.4 — Backward compatibility

The product today is mono-locale (`en-US`). Existing customers continue to use en-US until they switch. No customer migration required. The first translated TIER 1 locale ships with the I18N-β-3 milestone.

### §8.5 — Test plan

Per [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) test convention. Every locale + every formatter + every fallback path has a unit test. End-to-end: a fixture user with `de-DE` preference signs up → editor renders in German → creates a metric project → sees metric dimensions → switches display preference to imperial (per-project) → dimensions re-display imperially → IFC export remains metric.

---

## §9 — What is NOT in this contract

- **The translation copy itself for each locale** — that lives in `messages/<locale>.json`; the contract governs the structure, not the content
- **The drawing-standards specification** — [C34](C34-PRINT-AND-DRAWING-STANDARDS.md) is the canonical source
- **Per-jurisdiction LEGAL terminology** (contract templates, compliance phrasing) — out of scope; legal-counsel-reviewed copy is its own track
- **Speech-to-text or text-to-speech localisation** — out of scope (no voice surface today)
- **Audio / video subtitles** — out of scope (no synchronised media)
- **Per-locale customer-support staffing** — covered by [C42](C42-CUSTOMER-SUPPORT-TIER.md) (the follow-the-sun rota assumes regional language coverage; full language-pair coverage TBD)
- **Per-locale AI model selection** — the same model (Claude) handles all locales; the contract does not branch on locale
- **Pluralisation rules for languages with > 4 plural forms** — Russian + Arabic + Polish have complex rules. `Intl.PluralRules` handles them; the contract does not enumerate
- **Right-to-left text rendering in the 3D canvas** — out of scope. Dimensions in canvas use horizontal text only
- **Translation memory / TM systems** — out of scope. AI + human review serves the role
- **Locale-specific drawing layouts** (e.g. vertical Japanese text in title blocks) — out of scope for current sheet engine; future track

---

## §10 — Open questions (DRAFT-stage)

1. **TIER 1 expansion candidates**. After the initial 4 TIER 1 locales ship, which is next? Likely zh-CN (large market) or es-ES (broad coverage). Decision per sales/marketing priority.
2. **es-MX vs es-ES**. Spanish has notable regional variation (architectural terms differ; "albañilería" vs. "obra"). Currently es-ES is TIER 2; es-MX is unsupported. May need both as parallel locales.
3. **Vertical Japanese text**. Sheet title blocks in Japanese-architecture practice often use vertical-mode text. Out of scope for the current sheet engine; would require a major renderer pass. Open whether to scope a future track.
4. **Per-locale unit-system defaults**. §1.15 lists per-locale drawing standards. The unit-system default (metric vs. imperial) needs the same treatment. Currently `en-US` defaults to imperial, all others to metric — verify with customer data.
5. **Marketplace-pack moderation**. Community-translated locale packs may include errors or politically-loaded translations. Curation gate per [C40 §1.11](C40-MARKETPLACE-ECONOMICS.md) but specifics need design (e.g. require N native-speaker reviewers before publish).
6. **AI translation cost**. AI-assisted translation runs on each PR that touches `en-US.json`. At ~5000 keys × 5 TIER 1 locales × ~50 token average per translation × ~$0.005 / 1K tokens (Sonnet pricing) ≈ ~$6 per full re-translate. Budget on the CI infrastructure side; verify cost ceiling.
7. **Currency display for ambiguous symbols**. `$` is used by USD, AUD, CAD, NZD, etc. Should the display always include the ISO code (`$10.50 AUD`) or just the symbol (`$10.50`)? Per-customer preference?
8. **Plugin-emitted UI translation**. Plugins emit their own UI strings. Should plugins (a) ship their own `messages/<locale>.json` bundles, (b) consume the host's bundle for shared strings, (c) both? Trade-off: developer ergonomics vs. translation-coverage. Likely (c).

---

## §11 — Cross-reference summary

| Contract | Relationship |
|---|---|
| [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) | P6 — every locale mutation through commandBus; schemas L0-pure |
| [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md) | `.pryzm` stores SI metres regardless of user locale display preference |
| [C06](C06-UI-SHELL-AND-TOOLS.md) | UI shell hosts the locale switcher + the RTL layout root |
| [C09](C09-AI-AND-VISIBILITY-INTENT.md) | AI host emits responses in user's locale; glossary feeds prompts |
| [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) | All `locale.*` commands follow the protocol |
| [C25](C25-IFC-EXPORT-PRODUCTION.md) | IFC export unit declaration aligns with project's unitSystem |
| [C34](C34-PRINT-AND-DRAWING-STANDARDS.md) | Default drawing standard per locale |
| [C38](C38-COST-5D.md) | Currency display per locale × project currency |
| [C39](C39-PRICING-AND-PLAN-TIERS.md) | Stripe Adaptive Pricing displays in user's local currency |
| [C40](C40-MARKETPLACE-ECONOMICS.md) | Locale packs are first-class marketplace artefacts |
| [C41](C41-TELEMETRY-AND-ANALYTICS.md) | Event names are NEVER translated; locale-side telemetry is normal |
| [C43](C43-ACCESSIBILITY.md) | Lang attribute + locale-aware reading order |
| [C44](C44-MOBILE-AND-TABLET.md) | RTL on mobile |
| [C45](C45-BROWSER-AND-DEVICE-MATRIX.md) | Browser-locale detection per OS |

---

*End — C46 i18n & L10n, 2026-06-01 — DRAFT.*
