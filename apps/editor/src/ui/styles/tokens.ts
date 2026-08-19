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

