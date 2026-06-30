// Office building — the circular floor-plate PREVIEW SVG + the analytics panel HTML.
//
// PURE string builders (no DOM mutation, no THREE) — the modal injects the result.
// Mirrors the residential modal's brand: white + #6600FF, NO black.

import type { OfficeBuildingOk, OfficeZone } from '@pryzm/ai-host';

const PURPLE = '#6600FF';

/** Render the representative circular plate's concentric zones as an SVG disc. */
export function buildOfficePlatePreviewSvg(result: OfficeBuildingOk, sizePx = 320): string {
    const r = result.representativePlate.radiusM;
    const cx = sizePx / 2;
    const cy = sizePx / 2;
    const pad = 12;
    const scale = (sizePx / 2 - pad) / r;

    // Draw outer→inner so inner rings paint on top (concentric fills).
    const rings = [...result.representativePlate.zones]
        .sort((a, b) => b.outerRadiusM - a.outerRadiusM);

    const circles = rings
        .map((z) => {
            const rr = z.outerRadiusM * scale;
            return `<circle cx="${cx}" cy="${cy}" r="${rr.toFixed(1)}" fill="${z.color}" stroke="${PURPLE}" stroke-width="1" stroke-opacity="0.35"/>`;
        })
        .join('');

    // A subtle radial spoke set hints the desk grid (purely decorative, brand purple).
    const spokes = Array.from({ length: 12 }, (_, i) => {
        const a = (Math.PI * 2 * i) / 12;
        const x2 = cx + Math.cos(a) * (r * scale);
        const y2 = cy + Math.sin(a) * (r * scale);
        return `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${PURPLE}" stroke-opacity="0.08" stroke-width="1"/>`;
    }).join('');

    return (
        `<svg viewBox="0 0 ${sizePx} ${sizePx}" width="${sizePx}" height="${sizePx}" ` +
        `xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Circular office floor plate">` +
        `<rect width="${sizePx}" height="${sizePx}" fill="#FFFFFF"/>` +
        circles + spokes +
        `</svg>`
    );
}

/** A legend row for one zone kind. */
function legendRow(z: OfficeZone): string {
    const deskNote = z.desks > 0 ? ` · ${z.desks} desks` : '';
    return (
        `<div class="ob-legend-row">` +
        `<span class="ob-swatch" style="background:${z.color};border:1px solid ${PURPLE}55"></span>` +
        `<span class="ob-legend-label">${escapeHtml(z.label)}</span>` +
        `<span class="ob-legend-area">${Math.round(z.areaM2)} m²${deskNote}</span>` +
        `</div>`
    );
}

/** The analytics panel: desk count, m²/desk, % open/enclosed, daylight %, core ratio. */
export function buildOfficeAnalyticsHtml(result: OfficeBuildingOk): string {
    const a = result.analytics;
    const metric = (label: string, value: string): string =>
        `<div class="ob-metric"><div class="ob-metric-value">${value}</div><div class="ob-metric-label">${escapeHtml(label)}</div></div>`;

    const metrics =
        metric('Storeys', String(a.stories)) +
        metric('Height', `${Math.round(a.buildingHeightM)} m`) +
        metric('Desks / office floor', String(a.desksPerOfficeFloor)) +
        metric('Total desks', a.totalDesks.toLocaleString()) +
        metric('m² per desk', a.areaPerDeskM2.toFixed(1)) +
        metric('Core efficiency', `${Math.round(a.coreEfficiencyRatio * 100)}%`) +
        metric('% open-plan', `${Math.round(a.openPlanPct)}%`) +
        metric('% enclosed', `${Math.round(a.enclosedPct)}%`) +
        metric('Daylight-adjacent desks', `${Math.round(a.daylightAdjacentDeskPct)}%`);

    const legend = result.representativePlate.zones.map(legendRow).join('');

    // Floor-type variety summary (the floor-selector preview).
    const typeCounts = result.floors.reduce<Record<string, number>>((acc, f) => {
        acc[f.type] = (acc[f.type] ?? 0) + 1; return acc;
    }, {});
    const variety = Object.entries(typeCounts)
        .map(([t, n]) => `<span class="ob-chip">${escapeHtml(prettyType(t))} ×${n}</span>`)
        .join('');

    return (
        `<div class="ob-analytics">` +
        `<div class="ob-section-title">Floor-plate analytics</div>` +
        `<div class="ob-metrics">${metrics}</div>` +
        `<div class="ob-section-title">Rise zone</div>` +
        `<div class="ob-rise">${escapeHtml(a.riseZone)}</div>` +
        `<div class="ob-section-title">Zone mix (representative floor)</div>` +
        `<div class="ob-legend">${legend}</div>` +
        `<div class="ob-section-title">Floor-type variety (${a.stories} storeys)</div>` +
        `<div class="ob-chips">${variety}</div>` +
        `</div>`
    );
}

function prettyType(t: string): string {
    switch (t) {
        case 'lobby-amenity': return 'Café/amenity';
        case 'open-plan': return 'Open-plan';
        case 'sky-lobby': return 'Sky lobby';
        case 'mechanical': return 'Mechanical';
        case 'executive': return 'Executive';
        default: return t;
    }
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c
    ));
}
