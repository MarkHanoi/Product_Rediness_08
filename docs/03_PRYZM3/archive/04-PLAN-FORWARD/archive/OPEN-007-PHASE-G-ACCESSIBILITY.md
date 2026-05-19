# OPEN-007 — Phase G: WCAG 2.1 AA Accessibility

> **Status**: 🔴 ACTIVE — deferred (post-GA, government/enterprise procurement requirement)
> **Anchor**: Vision §5 NFT-17 ("WCAG 2.1 AA with keyboard-navigable 3D viewport"), C01 P1 (inclusion principle)
> **Gate**: `packages/wcag-audit/` package exists; no automated gate yet
> **Effort**: 2–4 months (specialist accessibility engineering)
> **Outcome**: WCAG 2.1 AA certification. 3D viewport fully keyboard-navigable. Screen reader support for panel hierarchy. Required for government/education/enterprise procurement.

---

## §0 — Why This Matters for PRYZM

BIM software is used by architecture firms, contractors, and government agencies. In many jurisdictions:
- **US Federal procurement**: Section 508 (equivalent to WCAG 2.1 AA) is required for any software deployed to government agencies
- **UK/EU**: EN 301 549 (equivalent to WCAG 2.1 AA) for public sector
- **Education sector**: Often required for university architecture departments

Without WCAG 2.1 AA, PRYZM cannot be sold to these customer segments. The `packages/wcag-audit/` package exists as a placeholder for automated checks, but no substantive accessibility work has been done.

---

## §1 — Current Accessibility State (2026-05-16)

### Known Gaps

| Component | Gap | WCAG Criterion |
|---|---|---|
| 3D viewport | No keyboard orbit/pan/zoom | 2.1.1 Keyboard |
| 3D viewport | No focus indicator visible | 2.4.7 Focus Visible |
| Panel hierarchy | No ARIA roles on nested panels | 4.1.2 Name, Role, Value |
| Modal dialogs | Missing `aria-modal`, focus trap | 2.1.2 No Keyboard Trap |
| Toolbar buttons | Many missing `aria-label` | 1.3.1 Info and Relationships |
| Context menus | Not keyboard accessible | 2.1.1 Keyboard |
| Property inspector | No form labels on inputs | 1.3.1 Info and Relationships |
| Color contrast | Unverified across dark/light themes | 1.4.3 Contrast (Minimum) |
| Motion/animation | No `prefers-reduced-motion` support | 2.3.3 Animation from Interactions |
| Error messages | Not announced to screen readers | 4.1.3 Status Messages |

### What Exists

- `packages/wcag-audit/` — stub package, no real implementation
- Basic HTML semantic structure in panel components
- Some ARIA labels on primary toolbar items (unverified coverage)

---

## §2 — Audit First (Sprint G.0)

Before writing remediation code, commission a proper accessibility audit. Options:

1. **Automated audit** (1 day): Run [axe-core](https://github.com/dequelabs/axe-core) + [Lighthouse](https://developer.chrome.com/docs/lighthouse/accessibility/) against the running app. Outputs a list of violations with WCAG criteria and element references.

2. **Manual audit** (1 week): Engage an accessibility specialist to test with screen readers (NVDA, JAWS, VoiceOver) and keyboard-only navigation. Outputs a prioritized remediation list.

**Recommended**: Do both — automated first (cheap, comprehensive for obvious issues), then manual for complex interactive patterns.

**Automated audit setup:**
```bash
# Install axe-core Playwright integration
pnpm add -D @axe-core/playwright

# Create: apps/editor/src/__tests__/a11y/accessibility.spec.ts
# Run: pnpm test:a11y
```

---

## §3 — Remediation Areas

### §3A — 3D Viewport Keyboard Navigation (hardest — 3–4 weeks)

The CameraController currently only responds to mouse events. WCAG 2.1.1 requires all functionality to be accessible via keyboard.

**Required keyboard bindings for 3D viewport:**

| Key | Action | Camera behavior |
|---|---|---|
| Arrow keys | Orbit camera | Small rotation increments |
| Shift + Arrow | Pan camera | Translate without rotation |
| + / - | Zoom | Dolly in/out |
| Home | Reset view | Return to default isometric |
| NumPad 1/3/7 | Front/Right/Top | Orthographic view presets |
| F | Focus on selection | Frame selected elements |
| Tab | Cycle selectable elements | Change selection focus |

**Implementation:**
1. Add keyboard event handlers to `CameraController.ts` (or `packages/renderer-three/src/camera/`)
2. Ensure the 3D canvas can receive focus (`tabIndex={0}`)
3. Add visible focus ring to the canvas boundary
4. Announce camera position changes to `aria-live` region

### §3B — ARIA Roles for Panel System (2 weeks)

The panel layout uses DOM elements for layout. Screen readers have no context about what each region does.

**Required ARIA structure:**
```html
<main role="main" aria-label="PRYZM 3D Editor">
  <aside role="complementary" aria-label="Tool Palette">
    <!-- toolbar items -->
  </aside>
  <section role="region" aria-label="3D Viewport">
    <canvas tabindex="0" aria-label="3D Model View — use arrow keys to orbit, +/- to zoom" />
  </section>
  <aside role="complementary" aria-label="Properties">
    <!-- property inspector -->
  </aside>
</main>
```

### §3C — Toolbar and Menu Keyboard Access (1 week)

All toolbar buttons and context menus must be keyboard-accessible with correct ARIA roles:

```html
<!-- Before -->
<div class="toolbar-button" onclick="...">Wall</div>

<!-- After -->
<button
  role="button"
  aria-label="Draw Wall (W)"
  aria-keyshortcuts="w"
  aria-pressed={isActive}
  tabindex="0"
>Wall</button>
```

Context menus need keyboard navigation (↑↓ to navigate, Enter to select, Escape to close) and `role="menu"` + `role="menuitem"`.

### §3D — Form Labels in Property Inspector (1 week)

All property inputs need explicit `<label>` elements:

```html
<!-- Before -->
<input type="number" value={height} />

<!-- After -->
<label for="element-height">Height (mm)</label>
<input id="element-height" type="number" value={height} aria-describedby="height-hint" />
<span id="height-hint" class="sr-only">Enter height in millimeters. Press Enter to apply.</span>
```

### §3E — Color Contrast Verification (1 week)

Run contrast ratio checks across all PRYZM color tokens in dark and light themes. WCAG AA requires:
- Normal text: ≥ 4.5:1
- Large text (≥ 18pt or 14pt bold): ≥ 3:1
- UI components: ≥ 3:1

Use `packages/ui-base/src/design-tokens.ts` as the source and verify each color pair.

### §3F — Reduced Motion (0.5 week)

All animations must respect `@media (prefers-reduced-motion: reduce)`:

```css
@media (prefers-reduced-motion: reduce) {
  .panel-transition { transition: none; }
  .loading-spinner { animation: none; }
  .camera-smooth { transition: none; } /* snap instead of smooth orbit */
}
```

---

## §4 — Automated Gate

Once remediation is underway, add to `tools/ga-gate/`:

```typescript
// tools/ga-gate/check-wcag-violations.ts
// Runs axe-core against the app and fails if critical violations exceed baseline
// Threshold: 0 critical violations (color contrast may have a separate grace period)
```

Also wire `packages/wcag-audit/` as a real package with:
- `runAxeAudit(url: string): Promise<WcagReport>`
- `checkColorContrast(tokens: DesignTokens): ContrastReport`
- Export to CI as JSON artifact

---

## §5 — Sprint Sequence

| Sprint | Focus | Effort | WCAG Criteria |
|---|---|---|---|
| G.0 | Automated axe-core audit (establish baseline) | 1 day | All |
| G.1 | ARIA roles for main layout + toolbar buttons | 1 week | 4.1.2, 1.3.1 |
| G.2 | 3D viewport keyboard orbit/pan/zoom | 2 weeks | 2.1.1, 2.4.7 |
| G.3 | Context menu + modal keyboard access | 1 week | 2.1.1, 2.1.2 |
| G.4 | Property inspector form labels | 1 week | 1.3.1, 3.3.2 |
| G.5 | Color contrast verification + fixes | 1 week | 1.4.3 |
| G.6 | Reduced motion support | 3 days | 2.3.3 |
| G.7 | Screen reader end-to-end test + certification audit | 2 weeks | All |

**Total**: ~2.5 months of focused accessibility engineering

---

## §6 — Acceptance Criteria

```bash
# Automated: 0 axe-core critical violations
pnpm tsx packages/wcag-audit/src/runAxeAudit.ts http://localhost:5000
# Expected: { critical: 0, serious: 0 }

# Manual: WCAG 2.1 AA certification from an accredited auditor (optional but recommended for gov)

# 3D keyboard navigation functional
# (manual test: open app, click viewport, use arrow keys — camera orbits)

# Screen reader announces panel changes
# (manual test: VoiceOver/NVDA reads panel focus changes)
```

---

*Stamp: 2026-05-16. Deferred post-GA. Priority rises when first government/enterprise prospect enters procurement process. Assign accessibility specialist. Start with G.0 audit (1 day) to get the baseline violation count.*
