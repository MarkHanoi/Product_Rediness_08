# PRYZM Mobile Responsiveness Plan
**Date:** 2026-04-18  
**Scope:** Landing Page, Projects Hub, Main 3D Scene  
**Breakpoints:** ≤768px (tablet/phone), ≤480px (phone-only)

---

## 1. Problem Statement

The screenshot provided (Android Chrome, ~390px viewport) demonstrates three critical failures:

- **Navbar** overflows horizontally — "Solutions", "Resources", and three CTA buttons are clipped off-screen
- **Hero heading** (46px) is truncated at the right edge — "buil…" and "intellige…" are cut off
- **Hero subtitle** is cut off — copy ends mid-sentence
- The entire layout is a fixed-width desktop experience with no responsive CSS

All three surfaces (Landing Page, Projects Hub, 3D Scene) share this architectural pattern: styles are injected as TypeScript string constants into `AppTheme.ts`. All responsive CSS **must follow the same pattern** — media queries added to those same constants.

---

## 2. Audit Summary

### 2.1 Landing Page (`marketingPages.ts`, `LandingPage.ts`)

| Element | Desktop | Mobile Issue |
|---|---|---|
| `.lp-nav` | 108px height, horizontal flex, 28px padding | Overflows; 3 CTA + links cannot fit |
| `.lp-nav-links` | flex row with dropdowns | Hidden behind clipped area |
| `.lp-nav-actions` | 3 buttons (Login, Contact, Get Started) | Way too wide for mobile |
| `.lp-hero` | padding-left 60px | Centres card off-screen |
| `.lp-hero-card` | padding 44px 52px, max-width 500px | Too much padding, no margin |
| `.lp-hero-heading` | 46px, letter-spacing -1.5px | Too large; wraps badly |
| `.lp-hero-sub` | max-width 380px | Gets clipped |
| `.lp-bespoke-inner` | flex row, gap 64px | Already has 1 MQ but needs more |
| Nav dropdowns | position absolute, min-width 520px | Overflows viewport |
| Mobile menu | Does not exist | Must be added (hamburger) |

### 2.2 Projects Hub (`projectHub.ts`, `ProjectHub.ts`)

| Element | Desktop | Mobile Issue |
|---|---|---|
| `.ph-shell` | flex row | Sidebar + main squished |
| `.ph-sidebar` | fixed 264px width | Takes ~68% of a 390px screen |
| `.ph-main-header` | padding 28px 48px | Too much lateral padding |
| `.ph-filter-bar` | padding 14px 48px, multi-button | Overflows or too dense |
| `.ph-grid` | padding 4px 48px | Near-zero usable grid width |
| `.ph-search-input` | width 200px (→ 260px focused) | Fine on desktop, cramped on mobile |
| `.ph-card` | minmax(210px, 1fr) | Needs to go single-column on mobile |
| `.ph-card-menu-btn` | display: none → show on hover | On touch: hover never fires |
| Sort buttons | 3 separate pills | Too many to fit in one row |
| Context menu | position absolute to card | Touch-friendly target size needed |
| Modals | max-width 95vw ✓ | Mostly OK; body padding needs reduction |

### 2.3 Main 3D Scene (PlatformShell + Ribbon + WMB + HUDs)

| Element | Desktop | Mobile Issue |
|---|---|---|
| `.plat-toolbar` | max-width 80vw, 36px height | Items overflow on narrow screens |
| `.plat-toolbar-inner` | white-space: nowrap, gap 6px | All items on one line — squished |
| `.plat-project-name` | max-width 90px | OK but competes with other items |
| `.plat-btn` | 11.5px font, 5px 10px padding | Sub-minimum touch target (< 44px) |
| `.plat-hub-btn` | 28px height | Below 44px minimum tap target |
| `.rb-content` | 85px min-height, horizontal groups | Complex, multi-group ribbon too wide |
| `.rb-icon-btn` | 40×40px | Acceptable, but groups wrap badly |
| `.rb-tab` | 6px 15px padding | Fine, wraps OK |
| `.wmb-bar` | Centered fixed pill | Mostly OK |
| `.wmb-btn` | 12px font, 5px 14px padding | Touch target marginal |
| `.plat-toast` | bottom 24px right 24px | Gets covered by OS chrome on mobile |
| Hub dropdown | min-width 240px, top 52px | May extend below viewport |
| Z-Slicer HUD | absolute positioned | May collide with toolbar |
| Lens bar | absolute positioned | May collide with other HUDs |
| Save/Undo/Redo HUD | needs checking | May overlap with keyboard |

---

## 3. Implementation Plan

### Phase A — Landing Page

**A1: Hamburger menu system**
- Add `.lp-hamburger` button (44×44px touch target) — visible only on mobile
- Add `.lp-mobile-drawer` — full-width slide-down menu with all nav links + CTA
- Add `.lp-mobile-drawer--open` state class toggled via JS in `LandingPage.ts`
- Hide `.lp-nav-links` and `.lp-nav-actions` on mobile (`display: none` at ≤768px)
- Show hamburger at ≤768px

**A2: Responsive hero section**
- At ≤768px: remove padding-left 60px → use padding 0 16px; center the card
- At ≤480px: hero card padding → 24px 20px; heading → 32px; subtitle → 14px
- Ensure `.lp-hero` is `min-height: auto` on mobile to allow scroll

**A3: Navbar height reduction**
- At ≤768px: reduce nav height from 108px to 60px
- Scale down logo icon from 48px to 36px

**A4: Bespoke section**
- Already has `flex-direction: column` at 768px
- Add: padding reduction, button full-width on mobile

**A5: Nav dropdowns**
- Solutions/Resources dropdowns are `min-width 520px` — way too wide
- On mobile they are hidden (hamburger replaces them), so ensure they are `display: none` on mobile

### Phase B — Projects Hub

**B1: Collapsible sidebar drawer on mobile**
- At ≤768px: sidebar becomes `position: fixed; left: -100%; width: 280px` off-canvas drawer
- Add `.ph-sidebar--open` → `left: 0` + overlay backdrop
- Add `.ph-mobile-topbar` — top bar on mobile with hamburger + section title + new project button
- Sidebar toggle JS in `ProjectHub.ts`

**B2: Main content padding**
- At ≤768px: reduce padding from 48px to 16px on all `.ph-main-*` elements
- Grid: `grid-template-columns: repeat(auto-fill, minmax(160px, 1fr))` at ≤600px
- Grid: `grid-template-columns: 1fr 1fr` at ≤480px

**B3: Filter/sort bar on mobile**
- At ≤600px: filter bar becomes horizontally scrollable (overflow-x: auto)
- Search input: flex: 1 min-width: 0 so it shrinks
- Sort buttons: remain visible but in a scrollable row

**B4: Card menu button always visible on touch**
- `.ph-card-menu-btn`: use `@media (hover: none)` to always show (not hide on no-hover)

**B5: Context menu touch safety**
- Increase context menu item height to 44px min on mobile
- Context menu itself: ensure it does not extend off-screen (flip direction if needed)

**B6: Modals on mobile**
- `.ph-modal`: padding reduction on body at ≤480px
- Modal close button: ensure 44px touch target

### Phase C — Main 3D Scene

**C1: Toolbar item collapsing on mobile**
- At ≤600px: hide status text (`.plat-status`) and project name (`.plat-project-name`)
- Keep: hub button, mode switcher, save/undo buttons
- Reduce toolbar padding on mobile
- Ensure all buttons ≥ 44px touch targets

**C2: All interactive elements — 44px minimum touch targets**
- `.plat-btn`: min-height 44px on mobile
- `.plat-hub-btn`: min-height 44px
- `.plat-mode-btn`: min-height 44px
- `.wmb-btn`: min-height 44px

**C3: Ribbon responsiveness**
- At ≤768px: ribbon tab row scrolls horizontally
- Tool groups: allow horizontal scroll; `overflow-x: auto`
- Ribbon height adjusts to content

**C4: Toast position**
- At ≤768px: toast moves from `bottom: 24px; right: 24px` → `bottom: 80px; left: 50%; transform: translateX(-50%); max-width: 90vw`
- Avoids OS bottom chrome (home indicator, nav bar)

**C5: HUD positioning on mobile**
- Z-Slicer, Lens bar: ensure they don't collide with toolbar (offset by toolbar height)
- On very narrow screens (≤480px), reduce their padding/sizing

**C6: Hub dropdown on mobile**
- At ≤480px: hub dropdown becomes `width: calc(100vw - 24px)` and `max-height: 70vh`

**C7: Preview banner on mobile**
- `.plat-preview-banner`: reduce font size, stack label + actions vertically at ≤480px

---

## 4. Touch Interaction Principles

1. **Minimum tap target**: 44×44px for all interactive elements (Apple HIG / Material)  
2. **Hover-dependent UI**: any UI revealed on `:hover` must also be accessible on touch (always-visible or tap-to-reveal)  
3. **No horizontal overflow**: no element should cause `overflow-x` on the document  
4. **Scroll instead of truncate**: long lists / toolbars scroll horizontally; they do not clip content  
5. **Safe areas**: padding-bottom accounts for iOS home indicator (`env(safe-area-inset-bottom)`)  

---

## 5. File Touch Map

| File | Changes |
|---|---|
| `src/styles/panels/marketingPages.ts` | Add mobile media queries; hamburger + drawer styles |
| `src/ui/platform/LandingPage.ts` | Add hamburger button HTML + JS toggle |
| `src/styles/panels/projectHub.ts` | Add mobile media queries; drawer styles; mobile topbar |
| `src/ui/platform/ProjectHub.ts` | Add mobile topbar HTML + JS sidebar toggle |
| `src/styles/panels/platformShell.ts` | Add mobile media queries for toolbar, ribbon, toast, WMB, hub dropdown |

No new files are created. No backend changes. No package additions.

---

## 6. Success Criteria

- [ ] Landing page navbar fits entirely within 390px viewport with no horizontal scroll
- [ ] Hamburger menu opens full-width drawer with all nav links and CTAs
- [ ] Hero card text is fully readable with no clipping on 390px viewport
- [ ] Projects Hub sidebar is hidden by default on mobile; accessible via hamburger
- [ ] All project cards are reachable in a 2-column grid on mobile
- [ ] Context menu and card options are accessible via touch (no hover required)
- [ ] 3D scene toolbar does not overflow 390px viewport
- [ ] All interactive elements in the 3D scene have ≥ 44px touch targets
- [ ] Toast notifications are visible above iOS home indicator
- [ ] No page causes horizontal scrolling
