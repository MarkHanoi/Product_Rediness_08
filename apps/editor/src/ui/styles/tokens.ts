/**
 * @file src/styles/tokens.ts
 *
 * Design token CSS custom properties shared across all PRYZM panels.
 * Injected once into <head> via AppTheme.injectAppTheme().
 *
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
import { UI_SCALE } from './uiScale';

export const DESIGN_TOKENS = `
    :root {
        /* §UI-DENSITY-SCALE — published from the ONE authority in uiScale.ts.
           Was previously hard-coded to 0.9 and referenced by nothing; the 0.9
           had instead been hand-multiplied into the literals below (10.8 = 12 ×
           0.9, 279 = 310 × 0.9 …).  Those residues are now scaled again by the
           injection-time transform like every other length, so this variable is
           reporting, not a second source of truth: read it, never re-derive it. */
        --app-ui-scale:       ${UI_SCALE};

        /* ═══════════════════════════════════════════════════════════════════
           §SHELL-FLOAT-BUDGET (L-4010..L-4016) — THE CANVAS REGION, PUBLISHED
           AS TWO NUMBERS. These are the only two facts every floating,
           canvas-anchored bar needs, and they are the ONE place a half-canvas
           mode is accounted for.
           ═══════════════════════════════════════════════════════════════════

           ⛔ THE DEFECT, MEASURED 2026-08-22. The shell floats a dozen bars at
           'position: fixed; left: 50%; translateX(-50%)'. In a HALF-canvas mode
           'left: 50%' is the right-hand PANEL's own left edge, so every one of
           them draws its right half onto the panel. The escape had been written
           by hand, once per (mode x bar):

             body.pryzm-mode-inspect  .wmb-toplevel-wrapper { left: 25% }
             body.pryzm-mode-inspect  .bam-container        { left: 25% }
             body.pryzm-mode-inspect  .ins-lens-bar         { left: 25% }
             body.pryzm-mode-inspect  .ins-explode-bar      { left: 25% }
             body.pryzm-mode-analysis .wmb-toplevel-wrapper { left: 25% }   (L-3601)

           FIVE rules for TWO modes and FOUR bars, i.e. three of the eight cells
           were simply missing — and the bar in the founder's screenshot,
           '.ceb-bar' (the editor toolbar: undo, redo, move, copy, delete and the
           drafting icons), was in NEITHER list. It is 'top: 56px' with 30px
           circular buttons, so it reaches y=86 — while the Analysis header
           reserve is 44px, derived from occluders that bottom out at y=36. That
           is the founder's still-sliced 'Every figure traceable to elements'.

           ⭐ ONE OWNED BUDGET, NOT A FIFTH PER-PANEL RESERVE. A reserve is the
           panel apologising for the shell; it has been added four times and the
           fifth would have been the hand-copy defect this repo keeps paying for.
           Instead the SHELL states where the canvas is and every bar centres on
           THAT. 'WorkspaceController._applyLayout()' writes both properties from
           the 'canvas' column of WORKSPACE_MODES — so a new half-canvas mode is a
           ROW (ADR-0343 §D.1), not a sixth CSS rule.

           ⚠ 'canvas: hidden' (Data mode) keeps 50%/100vw deliberately: there is
           no canvas to centre on, and the mode bar MUST stay reachable over the
           full-width workbench or the mode cannot be left. */
        --shell-canvas-cx:   50%;
        --shell-canvas-w:    100vw;

        /* §SHELL-TOPBAR-BAND (L-4030..L-4035) - THE VERTICAL HALF OF THE SAME
           BUDGET: how much of the top of the viewport the always-on fixed shell
           row occupies. Any OTHER bar that floats at the top of a canvas pane
           must start below it.

           ⛔ THE DEFECT, MEASURED 2026-08-22 from the founder's screenshot.
           '.wmb-toplevel-wrapper' is 'position: fixed; top: 6px' at z-index 200
           and is OPAQUE. '.svp-plan-view-header' - built by BOTH
           'PlanViewManager.ts:312' and 'SplitViewManager.ts:440' from one class -
           is 'position: absolute; top: 10px; left: 12px; right: 12px' at
           z-index 6, spanning its pane's FULL width with
           'justify-content: space-between'. The two bars occupy the SAME 30px
           band, and 200 paints over 6.

           So the shell row was covering the middle of the view header. What the
           founder photographed as 'an orphan chevron with no label' is the
           '.svp-view-select' with its LEFT half under the opaque bar: that
           select is 'appearance: none' with its chevron drawn as a
           'background-image' pinned to 'right 6px center', so the affordance
           survives at full opacity while the label does not. A control you can
           click and cannot read.

           ⭐ AND THIS IS WHY IT APPEARED TODAY. L-3500 added a THIRD child (the
           level pill) to the centred wrapper. The wrapper got wider, so it began
           covering ground it had not covered before. Nothing was duplicated -
           the '+Level:' select has always been the VIEW header's own control -
           but nothing anywhere said the two bars may not share a band.

           THE NUMBER, derived from the wrapper's own sheet, identically to the
           Analysis header reserve so there is ONE derivation and not two:
             6 (top) + 3 (wmb-bar padding) + 5 + 14 + 5 (wmb-btn) + 3 = 36 px
           Consumers add their own clearance on top. */
        --shell-topbar-h:    36px;
        --app-bg:            #e8edf6;
        --app-panel-bg:      #ffffff;
        /* §UX1-CONFIRM-GLASS — the translucent panel surface and its blur, declared
           ONCE here because C06 §6 puts every visual token in this layer and the
           onboarding confirm card is guarded token-only (see
           apps/editor/__tests__/typologyChoiceModel.test.ts). 0.92 is a SOLVED
           accessibility floor, not a taste value: over the worst-case backdrop
           (black) a white surface composites to alpha × 255, and 4.5:1 against
           the weakest foreground on that card (--app-text-2 / --vg-badge-warn-
           color, luminance ~0.1418) needs alpha ≥ 0.913. The derivation lives
           beside its one consumer, in onboardingStyles.ts §UX1-CONFIRM-GLASS. */
        --app-panel-glass:      rgba(255,255,255,0.92);
        --app-panel-glass-blur: blur(18px) saturate(1.35);
        --app-gradient:      linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%);
        --app-text:          #1a2035;
        --app-text-2:        #5a6a85;
        --app-text-muted:    #7a8aaa;
        --app-border:        #dde3f0;
        --app-border-light:  #eef1f8;
        --app-radius-lg:     16px;
        --app-radius-md:     12px;
        --app-radius-sm:     6px;
        --app-shadow-panel:  0 8px 32px rgba(30,50,120,0.13), 0 2px 8px rgba(30,50,120,0.07);
        --app-shadow-card:   0 2px 10px rgba(30,50,120,0.07), 0 1px 3px rgba(30,50,120,0.04);
        --app-shadow-header: 0 2px 12px rgba(102,0,255,0.35);
        --app-shadow-glow:   0 4px 16px rgba(102,0,255,0.40);
        --app-accent:        #6600FF;
        --app-violet-1:      #8B5CF6;
        --app-violet-2:      #7B3FF2;
        --app-violet-3:      #6600FF;
        --app-violet-soft:   rgba(102,0,255,0.08);
        --app-font:          'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        --app-font-size-body:  10.8px;
        --app-font-size-label: 9.9px;
        --app-font-size-h3:    11.7px;

        /* ── Status indicator tokens ─────────────────────────────────────── */
        --app-status-warning:   #f59e0b;
        --app-status-success:   #22c55e;
        --app-status-error:     #dc2626;
        --app-status-idle:      #7a8aaa;
        --app-status-violet:    #a855f7;
        --app-canvas-bg:        #0d1117;

        /* ── Furniture Carousel (fc-) design tokens ──────────────────────── */
        --fc-carousel-height:   279px;
        --fc-card-width:        153px;
        --fc-card-height:       189px;

        /* ── Tool HUD (th-) design tokens ────────────────────────────────── */
        --app-hud-bg:           rgba(232, 237, 246, 0.97);
        --app-hud-border:       1px solid rgba(139, 92, 246, 0.18);
        --app-success:          #16a34a;

        /* ── CDE state tokens (CDEVersionPanel) ─────────────────────────── */
        --cde-state-shared:     #3b82f6;
        --cde-state-published:  #16a34a;
        --cde-state-archived:   #6b7280;
        --cde-state-wip:        #ef4444;

        /* ── VG Governance badge / dot tokens ───────────────────────────── */
        --vg-badge-warn-bg:     #fff3cd;
        --vg-badge-warn-color:  #856404;
        --vg-badge-ok-bg:       #d1f5e0;
        --vg-badge-ok-color:    #1a6c3a;
        --vg-dot-view-override: #1a8fe0;
        --vg-dot-override:      #e6a817;
        --vg-dot-default:       #aaaaaa;

        /* ── Dark blue — option-background on dark property-panel header ── */
        --app-dark-blue:        #1e3a5f;

        /* ── Unified panel backdrop (§PANEL-BACKDROP-UNIFY) ───────────────
           ONE shared scrim behind EVERY floating panel/modal so they stop
           diverging (New-Project ~0.45 opaque · RAC/OS onboarding ~0.28–0.30
           · AI batch "Building N elements" ~0.58+heavy-blur). A single value
           that sits BETWEEN them: slightly more translucent than New-Project,
           not as see-through as the RAC panel. Brand: PRYZM purple-tinted dark
           (#6600FF family), NEVER pure black. Reference these two together. */
        --pryzm-panel-backdrop:      rgba(28, 12, 60, 0.26);
        --pryzm-panel-backdrop-blur: blur(2px);

        /* ── Loading ground (§UX2-LOADING-GROUND → §UX3-LOADING-GROUND-2 ·
           C06 §6, C84 EI-8/EI-9) ─────────────────────────────────────────
           Founder 2026-08-19 (twice): "make the background more grey, a bit
           darker, so we can see the PRYZM logo more" — and, looking at the still
           older deployed build, "darker grey than that, keep the prism rotating
           white, more white". These live HERE, not in 'LoadingOverlayView.ts',
           for the reason that file's own history shows: the tint has now been
           re-ruled FIVE times (§LOAD-MASK-OPAQUE-WHITE L-483 → §LOAD-MASK-TINT
           L-494 → §UX2's #C8C2DE → this), the first three as literals inside one
           screen, so every sibling loading surface drifted from it. A token is
           the difference between changing the vocabulary and adding a dialect.

           ⚠ THE GROUND ALONE DOES NOT MAKE THE MARK VISIBLE — MEASURED (§UX2).
           The prism's faces are white-at-alpha, so they COMPOSITE with the
           ground and darken in step with it. Both levers therefore move
           TOGETHER: the ground darker AND the face alphas up (front face now
           fully opaque, directly below).

           WHY EXACTLY hsl(259, 22%, 72%) AND NO DARKER — MEASURED 2026-08-19:
           the progress bar's light end is THE brand purple #6600FF, and
           SC 1.4.11 wants ≥3:1 for a meaningful graphic against this ground.
           On #B2A8C7 it reads 3.10:1; at 70% lightness it falls to 2.92:1. So
           this is the darkest purple-grey that keeps the brand-purple bar
           legal — going darker means giving up #6600FF in the gradient, which
           is a brand call, not a contrast call.

           NOT pure grey and NOT black: a purple-grey on the #6600FF hue
           (#B2A8C7 is hsl(259, 22%, 72%)), per the standing white+purple rule. */
        --pryzm-loading-ground:      #B2A8C7;

        /* Prism face alphas (§UX3-LOADING-GROUND-2 — "keep the prism rotating
           white, MORE WHITE"). The front face is now FULLY OPAQUE WHITE — the
           literal reading of the ask — and the other three keep §UX2's measured
           inter-face ratios exactly (0.88 : 0.66 : 0.50 : 0.38 scaled by 1/0.88),
           so the glass depth reading survives while the whole mark whitens.
           Measured against #B2A8C7: front 2.25:1 · left 1.88 · right 1.64 ·
           back 1.46 (§UX2's committed front was 1.62:1; the deployed build the
           founder is looking at is ~1.05:1). ⚠ Still below SC 1.4.11's 3:1 —
           white-on-light cannot reach 3:1 on any ground that carries this
           screen's dark text; §UX2's note stands: closing that gap needs a
           purple mark or stroke, which is a brand decision, not a value here.
           Consumed by 'PryzmLogoSpinner.ts' with the ORIGINAL values as CSS
           fallbacks, so any surface that does not load this sheet is unchanged
           rather than broken. The spinner is SHARED, so the sibling surfaces move
           with it — MEASURED on 'EngineLoadingOverlay''s pastel mesh (front face
           1.70→1.81 on #c8b6ff, 2.00→2.18 on #b8a2ff, 1.11→1.12 on the #f3f0ff
           base): whiter everywhere, worse nowhere. That boot screen keeps its own
           mesh-gradient ground on purpose — it is the landing-page palette, a
           different design decision from this overlay's masking ground. */
        --pryzm-prism-face-front:    1.00;
        --pryzm-prism-face-left:     0.75;
        --pryzm-prism-face-right:    0.57;
        --pryzm-prism-face-back:     0.43;

        /* Type on the loading ground. RE-MEASURED against #B2A8C7 (§UX3), because
           darkening a ground under text tuned for a lighter one is exactly where
           AA is lost — three of §UX2's five fell under 4.5:1 on the new ground
           and are darkened ONE step within their own hue; two held and are
           untouched:
             title  #1a1130  7.99:1  (unchanged — still has headroom)
             label  #3d3454  5.13:1  (unchanged — held above AA)
             note   #3f3757  4.92:1  (was #4e4468: 5.20 on #C8C2DE → 3.96 here)
             accent #4700b3  4.86:1  (was #5200cc: 5.48 → 4.18 here. Same hue and
                                      saturation as brand purple, hsl(264,100%,35%)
                                      — darkened only as far as AA required)
             error  #7d161c  4.65:1  (was #8f1a20: 5.23 → 3.99 here)
           All ≥ 4.5:1 for normal text (C43 §1.5 / SC 1.4.3). */
        --pryzm-loading-title:       #1a1130;
        --pryzm-loading-label:       #3d3454;
        --pryzm-loading-note:        #3f3757;
        --pryzm-loading-accent:      #4700b3;
        --pryzm-loading-error:       #7d161c;

        /* ── Floating panel chrome (§UX1-PANEL-CHROME, C06 §6) ────────────
           The FOUR floating site/GIS panels (Buildable envelope, Site
           analysis, Site plan overlay, and any that follow) were each styled
           with their own inline literals — 300 / 232 / 240 px wide, three
           different shadows, three different border colours, '13px' and
           '12px' body type. That is the same policy in several places,
           drifting: the §UI-DENSITY-SCALE lever in 'uiScale.ts' could not
           reach ANY of it, because the transform rewrites the injected
           stylesheet and those values live in 'Object.assign(el.style, …)'.
           Pointing the inline styles at these custom properties puts them
           back under the one density authority — the values below are the
           AUTHORED sizes; the effective size is value × --app-ui-scale.
           Smaller, quieter, and one place to change. */
        --pryzm-panel-surface:         #ffffff;
        --pryzm-panel-width:           272px;
        --pryzm-panel-width-wide:      288px;
        --pryzm-panel-min-width:       240px;
        --pryzm-panel-pad:             9px 11px;
        --pryzm-panel-radius:          10px;
        --pryzm-panel-gap:             7px;
        --pryzm-panel-border:          1px solid #ece7fb;
        /* Restrained: was '0 4px 18px rgba(20,10,60,0.18)' — a heavy drop that
           read as a modal, not a side card. Halved blur, ~55% of the alpha. */
        --pryzm-panel-shadow:          0 2px 10px rgba(20, 10, 60, 0.10);
        --pryzm-panel-ink:             #2a2340;
        --pryzm-panel-ink-muted:       #6b6480;
        --pryzm-panel-ink-faint:       #a49dbb;
        --pryzm-panel-rule:            #f1eefa;
        /* 'font-size' MUST appear in these names: 'uiScale.scaleDeclaration'
           keys the MIN_FONT_PX legibility floor off the property name, so a
           token called '--pryzm-panel-title-size' would scale straight through
           10px and land at 9.35px unfloored. Do not rename these. */
        --pryzm-panel-font-size-title: 12px;
        --pryzm-panel-font-size-body:  12px;
        --pryzm-panel-font-size-meta:  11px;

        /* ── The right-edge panel column (C06 §7.2, no-overlap policy) ────
           The founder's report included "one panel's close button sits on top
           of another panel's content". That was literally true: the Buildable
           envelope card is TOP-anchored with 'max-height: calc(100vh - 128px)'
           and the Site analysis panel is BOTTOM-anchored with
           'calc(100vh - 32px)' — on any viewport they claim the SAME pixels,
           and neither knew the other existed.

           The top offset is 148px, not the card's old 108px, because 108 is
           where the Forma view sub-bar already sits (GISAreaLayout
           mountFormaViewToggle) with the result-view toggle at 64 above it.
           148 clears both.

           These four values make the right edge a DECLARED, collision-free
           two-slot column: the top panel occupies [top, 50vh) and the bottom
           panel occupies [50vh, 100vh - bottom]. They tile exactly, and they
           only tile if the offsets and the max-heights use the SAME numbers —
           which is why all four are fenced out of the §UI-DENSITY-SCALE
           transform. Scaling the '148px' inside the calc() while the 'top: 148px'
           anchor stayed literal is precisely how a 13px overlap would creep
           back in. 'panelRegionTiling.spec.ts' pins the arithmetic. */
        /* @no-scale:start */
        --pryzm-panel-col-top:            148px;
        --pryzm-panel-col-max-height-top: calc(50vh - 148px);
        --pryzm-panel-col-bottom:            16px;
        --pryzm-panel-col-max-height-bottom: calc(50vh - 16px);
        /* @no-scale:end */

        /* ── Launcher-rail pills (the reopen affordances) ─────────────────
           C43 / WCAG 2.2 AA SC 2.5.8: these are the ONLY route back to the
           panels closed by default (C82 §1.1), so their hit target is fenced
           out of the density transform — 24px is a floor, not a preference.
           Only the target sizes are fenced; the pills' type is not. */
        /* @no-scale:start */
        --pryzm-pill-min-height:       26px;
        --pryzm-pill-pad:              5px 10px;
        /* @no-scale:end */
        --pryzm-pill-radius:           8px;
        --pryzm-pill-font-size:        11px;
        --pryzm-pill-shadow:           0 1px 6px rgba(20, 10, 60, 0.10);

        /* ── §PANEL-BRAND-STANDARD (L-1740..L-1744 · C06 §6) ──────────────
           The founder's report — "the inspect and data sections … don't follow
           the correct PRYZM ui standards … following the exactly colours" — is
           this block's whole reason to exist. Measured 2026-08-21, the two mode
           surfaces between them carried 226 hard-coded colour literals against
           this file's 60-odd tokens, including FOUR palettes that are not the
           product's: Tailwind slate (#e2e8f0 · #94a3b8 · #f8fafc · #0f172a), a
           rival blue accent (#3B8BD4), a rival purple (rgba(147,51,234,.90) —
           Tailwind purple-600, NOT #6600FF), and a cyan (rgb(0,180,220)).

           The literals were not merely duplicating tokens, they were CONTRADICTING
           them: 'var(--app-border, #e2e8f0)' appeared 18 times beside
           'var(--app-border, #dde3f0)' 10 times, for one token whose value is
           #dde3f0. Every one of those fallbacks is DEAD — AppTheme.injectAppTheme()
           concatenates DESIGN_TOKENS ahead of every panel sheet into ONE <style>
           element, so :root is always defined by the time a panel rule is read.
           A fallback that can never fire and disagrees with the token it backs is
           a second palette kept alive in comments-that-compile. They are removed,
           not corrected: correcting them would preserve the second source.

           The tokens below are the roles those literals were reaching for. They
           are named by ROLE, not by value, so the next panel asks "what is this
           FOR" instead of picking a hex.

           ⚠ Adding a value here is the ONLY sanctioned way to introduce a colour
           to a panel. If a role is missing, add the role — do not inline the hex. */

        /* Text/icon colour ON the brand accent, the brand gradient, or any other
           strong ground (a filled tooltip, an inverted chip). 6.98:1 against
           #6600FF — AA for normal text, AAA for large. */
        --app-on-accent:            #ffffff;
        /* Secondary ink and hairline veil on those same strong grounds — the
           count pill on a purple header bar, a ghost button inside it. Both
           panels had these as bare rgba(255,255,255,·) at five different alphas. */
        --app-on-accent-dim:        rgba(255,255,255,0.90);
        --app-on-accent-veil:       rgba(255,255,255,0.18);
        --app-on-accent-veil-hover: rgba(255,255,255,0.30);
        /* Accent under pointer/press. Same value as --app-violet-2; named
           separately because a hover is a ROLE and the ramp position is not. */
        --app-accent-hover:         #7B3FF2;

        /* Sunken surface — the recessed well behind a thumbnail, a code block,
           or an inset list. Replaces #fafafa / #f8fafc / #f8faff, which were
           three near-whites doing one job in one file. */
        --app-surface-sunken:       #f8faff;

        /* The FOUR interaction washes. The two panels used THIRTEEN distinct
           alphas of #6600FF (.04 .05 .06 .07 .08 .09 .10 .12 .15 .18 .2 .25 .30)
           for what is four states, so no two rows of the same kind matched.
           --app-violet-soft (0.08) already existed and is kept as the resting
           tint; these name the other three. */
        --app-wash-hover:           rgba(102,0,255,0.06);
        --app-wash-selected:        rgba(102,0,255,0.12);
        --app-wash-ring:            rgba(102,0,255,0.18);
        --app-focus-ring:           0 0 0 2px rgba(102,0,255,0.18);

        /* Elevation. The literals replaced here were rgba(0,0,0,·) — BLACK, which
           the standing white+purple rule forbids on product surfaces, and which
           is also why those panels read muddier than the rest of the app. These
           sit on the same blue-ink axis as --app-shadow-panel/-card. */
        --app-shadow-drawer:        -4px 0 24px rgba(30,50,120,0.10);
        --app-shadow-modal:         0 20px 60px rgba(30,50,120,0.18);
        --app-shadow-hud:           0 2px 12px rgba(30,50,120,0.14);

        /* Scrollbar thumb — the global rule at the foot of this file already
           paints every scrollbar #c4cde0; three panel rules re-declared it
           (twice as #c4cde0, once as #d0d4e3, which is a fourth grey). Named so
           a panel that genuinely needs its own thumb reads the same value. */
        --app-scrollbar-thumb:      #c4cde0;

        /* ── Status CARDS (soft ground + rule + ink) ──────────────────────
           --app-status-warning/-success/-error above are FILL colours: dots,
           bars, badges. They were also being used as TEXT, and as text on white
           they FAIL WCAG AA — measured on #ffffff: #d97706 is 3.19:1 and
           #16a34a is 3.30:1, both under the 4.5:1 floor for normal text
           (C43 §1.5 / SC 1.4.3). The -ink values below are the darkened
           members of the SAME hue that pass, measured on their own -bg:
             warn  #92400e on #fffbeb  6.84:1   (on white 7.09:1)
             ok    #15803d on #f0fdf4  4.79:1   (on white 5.02:1)
             err   #b91c1c on #fef2f2  5.91:1   (on white 6.47:1)
           So token-ising these is a contrast FIX, not a restyle. Use -ink for
           any status text; keep the plain token for fills. */
        --app-status-warning-bg:    #fffbeb;
        --app-status-warning-line:  #fde68a;
        --app-status-warning-ink:   #92400e;
        --app-status-success-bg:    #f0fdf4;
        --app-status-success-line:  #86efac;
        --app-status-success-ink:   #15803d;
        --app-status-error-bg:      #fef2f2;
        --app-status-error-line:    #fca5a5;
        --app-status-error-ink:     #b91c1c;

        /* ── §CHART-CATEGORICAL-SCALE (L-3001 · ADR-0343 §D.5 · SPEC §6) ──
           The categorical chart palette. Eight SERIES colours plus one named
           neutral. This is the scale ADR-0343 §U.2 deliberately left unnamed,
           because "asserting CVD-safety without simulating it is a hypothesis
           wearing the confidence of a measurement". It is named here because the
           simulation was RUN — see the numbers below, and the guard that re-runs
           them at __tests__/chartPalette.spec.ts.
           (⚠ No backticks anywhere in this block: DESIGN_TOKENS is itself a
           template literal, so one backtick in a comment ends the string and the
           whole theme fails to parse. Found the hard way, 2026-08-21.)

           ⚠ THIS IS A DELIBERATE, ARGUED EXCEPTION TO WHITE + PURPLE, NOT A
           RELAXATION OF IT. ADR-0343 §D.5.4: a purple-monochrome categorical
           scale CANNOT be colour-blind-safe. Separating eight series under
           deuteranopia, protanopia and tritanopia needs variation in lightness
           AND hue; a single-hue ramp gives lightness only. SC 1.4.1 wins over
           brand monochrome when colour is ENCODING rather than DECORATING —
           which is the distinction §D.5 draws between this block and
           §DATA-BUCKET-ACCENT-IS-ONE (which collapsed six DECORATIVE hues to
           one). Chrome on the Analysis surface is still --app-accent on white.

           PROVENANCE: series 1 is the brand accent. Series 2-8 are the
           Okabe-Ito palette (Wong, Nature Methods 8:441, 2011) with ONE
           substitution: its #0072B2 blue became #005F73, because under
           protanopia #0072B2 simulates to #5375b5 and #6600FF simulates to
           #005fff — ΔE00 10.20, the tightest pair in the set. The substitution
           lifted the global floor to 11.13. That was measured, not guessed.

           MEASURED 2026-08-21 — Machado/Oliveira/Fernandes (2009) severity-1.0
           simulation in linear sRGB, pairwise CIEDE2000 over CIE Lab (D65):
             normal   min ΔE00 21.72
             deuteran min ΔE00 11.52   (cat-2 vs cat-8)
             protan   min ΔE00 14.07   (cat-4 vs cat-6)
             tritan   min ΔE00 11.13   (cat-2 vs cat-6)  ← the global floor
           L* spread 36.8 … 89.1, so lightness is a real second channel.

           ⛔ COLOUR IS NEVER THE ONLY CHANNEL (SC 1.4.1). Measured contrast on
           white: cat-1 6.98:1 · cat-7 7.28:1 · cat-5 3.87:1 · cat-3 3.42:1 ·
           cat-6 3.06:1 · cat-4 2.31:1 · cat-2 2.25:1 · cat-8 1.32:1. Four of
           the eight are under 3:1 against white, and cat-8 is 1.32:1 — its
           lightness is exactly what makes the CVD floor work (every darker
           yellow tested collapsed into the orange family: #B8A400 dropped the
           floor to 1.01). So a fill in these colours MUST carry a 1px
           --app-panel-bg separator and a text label or legend entry. A slice
           identified by hue alone is a defect, not a style choice.

           ⛔ Do NOT extend this to --app-cat-9. Eight is where the floor stops
           clearing 10. A ninth series is a "+N others" bucket, not a colour. */
        --app-cat-1:                #6600FF;
        --app-cat-2:                #E69F00;
        --app-cat-3:                #009E73;
        --app-cat-4:                #56B4E9;
        --app-cat-5:                #D55E00;
        --app-cat-6:                #CC79A7;
        --app-cat-7:                #005F73;
        --app-cat-8:                #F0E442;
        /* NOT part of the rotation. "unassigned" / "untyped" is a real answer
           and must never be mistaken for a category — SPEC §4.1 W2/W3 require
           it as its own named slice, never folded into the largest. Same value
           as --app-scrollbar-thumb, declared separately because this is a ROLE.
           Verified NOT to degrade the scale: adding it keeps the global floor at
           11.13 (the greys that read as "muted" — #9AA6BC, #7A8AAA — collapse
           into cat-6 under deuteranopia at ΔE00 5.34 and 0.73). */
        --app-cat-unassigned:       #C4CDE0;
    }

    /* ── Global typography baseline (§05 §2.3 Rule 6) ────────────────────── */
    body,
    button,
    input,
    select,
    textarea {
        font-family: var(--app-font);
    }

    :where(.plat-toolbar, .plat-hub-dropdown, .plat-modal, .tp-panel, .vb-panel, .plat-left-panel, .tpr-panel, .lnr-rail, #dw-workbench, .bam-container, .fc-container, .wmb-bar, .pi-section, .dw-section) {
        font-size: var(--app-font-size-body);
    }

    /* ── Global thin scrollbar (§05 §2.3 Rule 7) ─────────────────────────── */
    * {
        scrollbar-width: thin;
        scrollbar-color: #c4cde0 transparent;
    }
    *::-webkit-scrollbar { width: 4px; height: 4px; }
    *::-webkit-scrollbar-track { background: transparent; }
    *::-webkit-scrollbar-thumb { background: #c4cde0; border-radius: 2px; }
    *::-webkit-scrollbar-thumb:hover { background: #a8b4cc; }

    /* ── Shared utility keyframes ─────────────────────────────────── */
    @keyframes vtToastIn {
        from { opacity: 0; transform: translateY(10px); }
        to   { opacity: 1; transform: translateY(0); }
    }
`;

