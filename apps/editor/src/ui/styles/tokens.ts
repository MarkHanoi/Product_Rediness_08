/**
 * @file src/styles/tokens.ts
 *
 * Design token CSS custom properties shared across all PRYZM panels.
 * Injected once into <head> via AppTheme.injectAppTheme().
 *
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const DESIGN_TOKENS = `
    :root {
        --app-ui-scale:       0.9;
        --app-bg:            #e8edf6;
        --app-panel-bg:      #ffffff;
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

