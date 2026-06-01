# PRYZM Mobile Responsiveness Contract
**Contract ID:** MOB-001  
**Date:** 2026-04-18  
**Author:** PRYZM Engineering  
**Status:** ACTIVE

---

## §1 Scope & Applicability

This contract governs all CSS and JavaScript changes made to achieve mobile responsiveness across:

- **MOB-001-LP** Landing Page (`src/ui/platform/LandingPage.ts`, `src/styles/panels/marketingPages.ts`)
- **MOB-001-PH** Project Hub (`src/ui/platform/ProjectHub.ts`, `src/styles/panels/projectHub.ts`)
- **MOB-001-SC** Main 3D Scene (`src/styles/panels/platformShell.ts`)

All work in this contract is **additive only** — no desktop styles are modified. Only media queries and new mobile-specific CSS classes are appended.

---

## §2 CSS Architecture Contract

### §2.1 No Independent Style Injection
All CSS additions **must** be appended to the existing exported string constants in their respective style files. No component may inject its own `<style>` tag.

| Surface | Constant | File |
|---|---|---|
| Landing Page | `LANDING_PAGE_STYLES` | `src/styles/panels/marketingPages.ts` |
| Resources/Solutions dropdowns | `RESOURCES_STYLES`, `SOLUTIONS_STYLES` | `src/styles/panels/marketingPages.ts` |
| Project Hub | `PROJECT_HUB_STYLES` | `src/styles/panels/projectHub.ts` |
| Platform Shell | `PLATFORM_SHELL_STYLES` | `src/styles/panels/platformShell.ts` |
| Workspace Mode Bar | `WMB_STYLES` | `src/styles/panels/platformShell.ts` |
| Ribbon | `RIBBON_STYLES` | `src/styles/panels/platformShell.ts` |

### §2.2 CSS Prefix Ownership
All new mobile-specific classes **must** use the prefix of the component they belong to.  
No new prefixes are introduced:

| Prefix | Owner |
|---|---|
| `lp-` | Landing Page |
| `ph-` | Project Hub |
| `plat-` | Platform Shell |
| `wmb-` | Workspace Mode Bar |
| `rb-` | Ribbon |

### §2.3 Breakpoints
Two global breakpoints are used consistently across all surfaces:

| Name | Value | Target |
|---|---|---|
| `mobile` | `max-width: 768px` | Tablets and phones |
| `phone` | `max-width: 480px` | Phones only |

No other breakpoints are introduced.

### §2.4 Additive-Only Rule
Desktop styles (no media query wrapper) are **never modified**. All mobile changes are wrapped in `@media (max-width: 768px)` or `@media (max-width: 480px)` blocks appended at the end of each constant string.

---

## §3 Touch Target Contract

### §3.1 Minimum Size
Every interactive element (button, link, input, menu item) **must** have a minimum tap target of **44×44px** on mobile. This is achieved via:
```css
@media (max-width: 768px) {
    .element { min-height: 44px; padding: ... }
}
```

### §3.2 Hover-Only UI Prohibition
No UI critical to functionality may be **exclusively** revealed via `:hover` on mobile. The card context menu button (`.ph-card-menu-btn`) is made always-visible on touch devices using:
```css
@media (hover: none) {
    .ph-card-menu-btn { display: flex; }
}
```

### §3.3 Touch Feedback
All buttons **must** have a visible `:active` state on mobile. The existing `:hover` transitions already provide this on desktop.

---

## §4 Layout Contract

### §4.1 No Horizontal Scroll
No surface may cause `document.documentElement.scrollWidth > window.innerWidth` on a 390px viewport. This is verified by visual inspection and screenshot.

### §4.2 Safe Area Insets
Elements fixed to the bottom of the viewport **must** account for iOS home indicator:
```css
padding-bottom: env(safe-area-inset-bottom, 0px);
```
Applied to: `.lp-mobile-drawer`, `.plat-toast` (bottom variants).

### §4.3 Sidebar Drawer Pattern (Project Hub)
On mobile the sidebar becomes an off-canvas drawer:
- Default: `transform: translateX(-100%)` (off-screen left)
- Open: `transform: translateX(0)` with `.ph-sidebar--open`
- Backdrop: `.ph-mobile-backdrop` covers main content with `rgba` overlay
- Z-index: sidebar `z-index: 200`, backdrop `z-index: 199`

### §4.4 Hamburger Menu Pattern (Landing Page)
On mobile the navbar actions are replaced by a hamburger icon:
- Hamburger: `.lp-hamburger` button, 44×44px, visible only at ≤768px
- Drawer: `.lp-mobile-drawer` — full-width absolute panel below navbar
- State: `.lp-mobile-drawer--open` → `max-height: 600px` (CSS transition)
- Nav links and nav actions are hidden at ≤768px via `display: none`

---

## §5 JavaScript Contract

### §5.1 Minimal JS Additions
Only two JS additions are made to TypeScript components:

**LandingPage.ts:** Hamburger toggle
```typescript
const hamburger = el.querySelector<HTMLButtonElement>('.lp-hamburger')!;
const drawer = el.querySelector<HTMLElement>('.lp-mobile-drawer')!;
hamburger.addEventListener('click', () => {
    const isOpen = drawer.classList.contains('lp-mobile-drawer--open');
    drawer.classList.toggle('lp-mobile-drawer--open', !isOpen);
    hamburger.setAttribute('aria-expanded', String(!isOpen));
});
```

**ProjectHub.ts:** Sidebar toggle
```typescript
// Mobile sidebar open/close via hamburger button in mobile topbar
const mobileHamburger = el.querySelector<HTMLButtonElement>('.ph-mobile-hamburger')!;
const sidebar = el.querySelector<HTMLElement>('#ph-sidebar')!;
const backdrop = el.querySelector<HTMLElement>('.ph-mobile-backdrop')!;
```

### §5.2 No External Dependencies
Zero new packages are installed. All mobile JS is vanilla TypeScript/DOM.

### §5.3 Event Cleanup
All added event listeners are attached in the existing `build()` / `attachListeners()` methods and are automatically garbage-collected when the component is destroyed via its existing `destroy()` pattern.

---

## §6 3D Scene Constraints

### §6.1 Canvas Preservation
The Three.js canvas (`<canvas>`) is **never hidden or resized** by mobile CSS. Only the overlay UI elements (toolbar, HUDs, ribbons) are adjusted.

### §6.2 Toolbar Collapse Hierarchy
On mobile, toolbar items are hidden in this priority order (lowest priority hidden first):
1. Hide: status text `.plat-status` (least critical)
2. Hide: dividers `.plat-divider` (visual only)
3. Keep: hub button, mode switcher, save/undo buttons (critical)

### §6.3 HUD Positioning Safety
HUDs are not repositioned by this contract. Only their `max-width`, `padding`, and `font-size` are adjusted on mobile to prevent overflow.

---

## §7 Forbidden Actions

The following are prohibited under this contract:

- ❌ Modifying any desktop CSS rule (no media query wrapper)
- ❌ Adding new TypeScript files
- ❌ Adding new npm packages
- ❌ Changing the server or backend
- ❌ Touching the Three.js canvas initialization
- ❌ Modifying z-index values for desktop contexts
- ❌ Removing any existing functionality (only adapt layout)
- ❌ Injecting `<style>` tags from component code
- ❌ Using `!important` except where strictly necessary for override specificity

---

## §8 Deliverables Checklist

### Landing Page (MOB-001-LP)
- [x] Hamburger button added to navbar HTML (≤768px visible)
- [x] Mobile drawer HTML added with all nav links + CTAs
- [x] Hamburger toggle JS in `LandingPage.ts`
- [x] `@media (max-width: 768px)` block in `LANDING_PAGE_STYLES`
- [x] `@media (max-width: 480px)` block in `LANDING_PAGE_STYLES`
- [x] Solutions/Resources dropdowns hidden on mobile
- [x] Hero card padding reduced
- [x] Hero heading font-size reduced to 30px at ≤480px
- [x] Navbar height reduced to 60px at ≤768px

### Project Hub (MOB-001-PH)
- [x] Mobile top bar HTML added (hamburger + title + new project)
- [x] Sidebar drawer CSS (off-canvas, slide-in)
- [x] Mobile backdrop overlay CSS
- [x] Sidebar toggle JS in `ProjectHub.ts`
- [x] `@media (max-width: 768px)` block in `PROJECT_HUB_STYLES`
- [x] `@media (max-width: 480px)` block in `PROJECT_HUB_STYLES`
- [x] Grid padding reduced to 16px on mobile
- [x] Card menu button always visible on touch (`hover: none`)
- [x] Sort bar scrolls horizontally on mobile
- [x] Modal width/padding adapted for mobile

### 3D Scene (MOB-001-SC)
- [x] `@media (max-width: 768px)` block in `PLATFORM_SHELL_STYLES`
- [x] `@media (max-width: 480px)` block in `PLATFORM_SHELL_STYLES`
- [x] All buttons ≥ 44px touch target on mobile
- [x] Toolbar non-essential items hidden on mobile
- [x] Toast repositioned above OS chrome on mobile
- [x] Hub dropdown max-width constrained on mobile
- [x] Ribbon tab row horizontally scrollable
- [x] `@media (max-width: 768px)` block in `WMB_STYLES`
- [x] `@media (max-width: 768px)` block in `RIBBON_STYLES`

---

## §9 Version History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | 2026-04-18 | PRYZM Engineering | Initial mobile responsiveness contract |
