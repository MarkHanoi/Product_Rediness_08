/**
 * Collaborative Presence styles — `cp-` prefix
 *
 * CONTRACT §50 §7 — all cp-* classes defined here.
 * CONTRACT §05 §2.1 — injected via AppTheme.ts only.
 * CONTRACT §05 §3 — `cp-` prefix registered and owned by this module.
 *
 * Elements:
 *   cp-presence-strip    Fixed HUD listing online collaborators
 *   cp-chip              Per-user avatar circle
 *   cp-chip--self        Modifier: local user chip (white ring)
 *   cp-chip-initials     2-letter initials inside chip
 *   cp-chip-tooltip      Hover full-name tooltip
 *   cp-overflow          "+N" overflow counter chip
 */

export const COLLABORATIVE_PRESENCE_STYLES = `

/* ── Presence strip ─────────────────────────────────────────────────── */
.cp-presence-strip {
    position: fixed;
    top: 8px;
    right: 8px;
    z-index: 9990;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    pointer-events: auto;
}

/* ── User chip ──────────────────────────────────────────────────────── */
.cp-chip {
    position: relative;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: default;
    box-shadow: 0 1px 4px rgba(0,0,0,0.35);
    flex-shrink: 0;
    border: 1.5px solid rgba(255,255,255,0.55);
    transition: transform 0.15s ease;
}

.cp-chip:hover {
    transform: scale(1.12);
}

.cp-chip--self {
    border: 2.5px solid #ffffff;
    box-shadow: 0 0 0 1.5px rgba(255,255,255,0.3), 0 1px 4px rgba(0,0,0,0.35);
}

/* ── Initials ──────────────────────────────────────────────────────── */
.cp-chip-initials {
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    font-family: var(--app-font, -apple-system, BlinkMacSystemFont, sans-serif);
    letter-spacing: 0.02em;
    user-select: none;
    line-height: 1;
}

/* ── Tooltip ───────────────────────────────────────────────────────── */
.cp-chip-tooltip {
    position: absolute;
    top: calc(100% + 5px);
    left: 50%;
    transform: translateX(-50%);
    background: #1a2035f0;
    color: #e8eaf0;
    font-size: 11px;
    font-family: var(--app-font, -apple-system, BlinkMacSystemFont, sans-serif);
    white-space: nowrap;
    padding: 4px 8px;
    border-radius: 4px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease;
    box-shadow: 0 2px 8px rgba(0,0,0,0.35);
    z-index: 10;
}

.cp-chip:hover .cp-chip-tooltip {
    opacity: 1;
}

/* ── Overflow counter ──────────────────────────────────────────────── */
.cp-overflow {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #2a3a5a;
    border: 1.5px solid rgba(255,255,255,0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9ba8c2;
    font-size: 9px;
    font-weight: 700;
    font-family: var(--app-font, -apple-system, BlinkMacSystemFont, sans-serif);
    cursor: default;
    box-shadow: 0 1px 4px rgba(0,0,0,0.35);
    flex-shrink: 0;
}
`;
