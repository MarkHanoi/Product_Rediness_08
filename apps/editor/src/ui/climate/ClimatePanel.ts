/**
 * ClimatePanel.ts — A.11 (Phase A · Sprint 2)
 *
 * L5 Climate substrate UI. A singleton floating card that visualises the
 * A.10 climate substrate (ClimateDataset on the L3 ClimateStore, anchored
 * to the C19 SiteModel's lat/lon) as three site-intelligence sub-views:
 *
 *   1. Sun-path diagram   — polar/stereographic solar arcs for solstices
 *                           + equinox (NOAA `solarSample` via the pure
 *                           `climateChartData` helpers).
 *   2. Wind rose          — 16-sector radial frequency bars from the
 *                           dataset's WindRoseAggregate.
 *   3. Temperature profile — annual monthly min/avg/max line band from
 *                           the dataset's monthlyNormals.
 *
 * DATA FLOW (read-only):
 *   runtime.siteModelStore.getSite()         → SiteId + lat/lon
 *   runtime.climateStore.resolveSite(siteId) → ClimateDataset | null
 *
 * RULES (mirrors RoomGraphPanel / RealSunControl idiom):
 *   - UI-only. NEVER writes to any store directly (P6).
 *   - No THREE imports. No Anthropic / fetch calls.
 *   - All chart math is in the pure `climateChartData.ts` helper (P5-ish
 *     separation); this file only renders SVG + wires DOM.
 *   - Styles live in AppTheme (CLIMATE_PANEL_STYLES), never inline <style>.
 *   - CSP-safe: addEventListener only, no inline handlers.
 *
 * References:
 *   - docs/02-decisions/contracts/C21-CLIMATE-INGESTION.md
 *   - docs/03-execution/plans/master-execution-tracker.md A.11
 */

import { injectAppTheme } from '../styles/AppTheme';
import { makeDraggable } from '../makeDraggable';
import { getCurrentSiteOrigin } from '../site/siteDispatch';
import type { ClimateDataset, SiteId } from '@pryzm/schemas';
import {
    solarArcsForYear,
    projectSunToDisc,
    windRoseBars,
    windBarEndpoint,
    monthlyTempSeries,
    COMPASS_16,
    type SunArc,
} from './climateChartData';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Accent + arc palette (purple family per the #6600FF single-source rule).
const ACCENT = '#6600FF';
const ARC_COLORS = ['#f59e0b', '#10b981', '#3b82f6']; // summer / equinox / winter

// ── Runtime injection (module-load singleton, RoomGraphPanel pattern) ────────

let _runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null;
export function wireClimateRuntime(
    rt: import('@pryzm/runtime-composer/types').PryzmRuntime | null,
): void {
    _runtime = rt;
}
export function getClimateRuntime():
    | import('@pryzm/runtime-composer/types').PryzmRuntime
    | null {
    return _runtime;
}

// ── Singleton DOM state ──────────────────────────────────────────────────────

let _panel: HTMLElement | null = null;
let _body: HTMLElement | null = null;
let _unsub: (() => void) | null = null;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Open the climate panel. Creates it on first call; re-renders on every
 * call. Subscribes to ClimateStore + SiteModelStore so the views refresh
 * when an EPW is ingested or the site location moves.
 */
export function openClimatePanel(
    runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
): void {
    if (runtime) _runtime = runtime;
    if (!_panel) {
        _panel = _build();
        document.body.appendChild(_panel);
        _subscribe();
    }
    _panel.style.display = 'flex';
    _render();
    // A.21.D33(f) — GUARANTEE a dataset on open. The panel is opened from the
    // GIS rail / Site inspector independently of the Forma analysis controls, so
    // those entry points never ran `ensureSiteClimate` and the card sat on "No
    // climate dataset imported" forever even with a site location set. Kick a
    // proactive ingest here: the bundled offline default lands instantly (no
    // network) and the `climateStore.subscribe()` above repaints the wind rose +
    // temperature profile. Fire-and-forget + fully guarded — never throws, and
    // it is idempotent/cheap (skips when a dataset already exists).
    _ensureClimateOnOpen();
}

/** Proactively ingest a ClimateDataset for the active site when the panel opens
 *  (offline bundled default = instant). Idempotent; never throws. */
function _ensureClimateOnOpen(): void {
    const rt = _runtime;
    if (!rt) return;
    import('./ensureSiteClimate')
        .then(({ ensureSiteClimate }) => ensureSiteClimate(rt))
        .then((ok) => {
            console.log(`[ClimatePanel] proactive ensureSiteClimate → ${ok ? 'dataset present' : 'no location/site'}.`);
        })
        .catch((e) => console.warn('[ClimatePanel] ensureSiteClimate failed:', e));
}

/** Hide the panel (kept in the DOM for cheap re-open). */
export function closeClimatePanel(): void {
    if (_panel) _panel.style.display = 'none';
}

/** Toggle visibility. */
export function toggleClimatePanel(
    runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
): void {
    if (_panel && _panel.style.display !== 'none') closeClimatePanel();
    else openClimatePanel(runtime);
}

export function isClimatePanelOpen(): boolean {
    return !!_panel && _panel.style.display !== 'none';
}

/** Test/HMR hygiene — tear the panel down + drop subscriptions. */
export function disposeClimatePanel(): void {
    if (_unsub) {
        try { _unsub(); } catch { /* ignore */ }
        _unsub = null;
    }
    if (_panel?.parentElement) _panel.parentElement.removeChild(_panel);
    _panel = null;
    _body = null;
}

// ── Build shell ──────────────────────────────────────────────────────────────

function _build(): HTMLElement {
    injectAppTheme();
    const el = document.createElement('div');
    el.className = 'clm-panel';
    el.style.display = 'none';

    const header = document.createElement('div');
    header.className = 'clm-header';
    header.style.cursor = 'move'; // §A.10.h — draggable affordance (founder ask)
    const title = document.createElement('span');
    title.className = 'clm-title';
    title.textContent = '🌦 Climate & Site Intelligence';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'clm-close';
    close.title = 'Close';
    close.textContent = '✕';
    close.addEventListener('click', () => closeClimatePanel());
    header.appendChild(title);
    header.appendChild(close);

    const body = document.createElement('div');
    body.className = 'clm-body';
    _body = body;

    el.appendChild(header);
    el.appendChild(body);

    // §A.10.h (founder) — make the climate card movable by dragging its header.
    // The shared helper re-evaluates the handle on each mousedown (safe with the
    // body re-rendering) and excludes the close button so ✕ still closes.
    try { makeDraggable(el, '.clm-header', ['.clm-close'], _runtime); }
    catch (e) { console.warn('[ClimatePanel] makeDraggable wiring failed (non-fatal):', e); }

    return el;
}

function _subscribe(): void {
    const rt = _runtime;
    if (!rt) return;
    const refresh = () => { if (isClimatePanelOpen()) _render(); };
    const disposers: Array<() => void> = [];
    try { disposers.push(rt.climateStore.subscribe(refresh)); } catch { /* ignore */ }
    try { disposers.push(rt.siteModelStore.subscribe(refresh)); } catch { /* ignore */ }
    _unsub = () => disposers.forEach((d) => { try { d(); } catch { /* ignore */ } });
}

// ── Render ───────────────────────────────────────────────────────────────────

function _render(): void {
    const body = _body;
    if (!body) return;
    body.replaceChildren();

    const rt = _runtime;
    const site = rt?.siteModelStore.getSite() ?? null;
    let loc = site?.location ?? null;

    // §CESIUM-SITE-ORIGIN fallback — the onboarding handoff can leave getSite()/
    // .location null while the process-wide LTP-ENU origin IS set (the same
    // null-location timing gap already fixed for the Forma camera + massing +
    // climate-ingest). Fall back to that origin so the climate card ACTIVATES at
    // the real plot and the sun-path renders, instead of the misleading
    // "No site location set" the founder saw with a location clearly set.
    if (!loc) {
        const ltp = getCurrentSiteOrigin();
        if (ltp && (ltp.lat !== 0 || ltp.lon !== 0)) {
            loc = { latitude: ltp.lat, longitude: ltp.lon } as NonNullable<typeof loc>;
        }
    }

    // Empty-state ONLY when no location can be resolved from ANY source.
    if (!loc) {
        body.appendChild(
            _emptyState(
                '📍',
                'No site location set',
                'Set the site location (lat/lon) via the Site tools, then import an EPW or refresh NOAA normals to see sun-path, wind, and temperature data here.',
            ),
        );
        return;
    }

    // The climate DATASET still needs the Site aggregate (keyed by site.id); the
    // sun-path + summary below need only lat/lon, so they render either way.
    const dataset: ClimateDataset | null = site
        ? rt?.climateStore.resolveSite(site.id as SiteId) ?? null
        : null;

    // Site summary header is always shown once a site exists.
    body.appendChild(_siteSummary(loc.latitude, loc.longitude, dataset));

    // Sun-path works from lat/lon ALONE (no EPW needed) — always render it.
    body.appendChild(_sunPathBlock(loc.latitude, loc.longitude));

    if (!dataset) {
        body.appendChild(
            _emptyState(
                '🌦',
                'No climate dataset imported',
                'Import an EPW file or refresh NOAA normals for this site to unlock the wind rose and temperature profile. The sun-path above is computed from the site coordinates alone.',
            ),
        );
        return;
    }

    body.appendChild(_windRoseBlock(dataset));
    body.appendChild(_tempProfileBlock(dataset));
}

// ── Site summary ─────────────────────────────────────────────────────────────

function _siteSummary(
    lat: number,
    lon: number,
    dataset: ClimateDataset | null,
): HTMLElement {
    const row = document.createElement('div');
    row.className = 'clm-site';
    const coords = document.createElement('span');
    coords.innerHTML =
        `<strong>${lat.toFixed(4)}°, ${lon.toFixed(4)}°</strong>`;
    row.appendChild(coords);
    if (dataset) {
        const tag = document.createElement('span');
        tag.className =
            'clm-source-tag' +
            (dataset.source === 'fallback-defaults' ? ' clm-source-tag--fallback' : '');
        tag.textContent = dataset.source;
        row.appendChild(tag);
    } else {
        const note = document.createElement('span');
        note.className = 'clm-source-tag clm-source-tag--fallback';
        note.textContent = 'no dataset';
        row.appendChild(note);
    }
    return row;
}

// ── Sub-view: Sun-path ───────────────────────────────────────────────────────

function _sunPathBlock(lat: number, lon: number): HTMLElement {
    const block = _block('Sun-path (stereographic)');
    const year = new Date().getUTCFullYear();
    let arcs: SunArc[] = [];
    try {
        arcs = solarArcsForYear(lat, lon, year);
    } catch (err) {
        console.warn('[ClimatePanel] sun-path compute failed:', err);
        block.appendChild(_note('Could not compute solar arcs for this location.'));
        return block;
    }
    const wrap = document.createElement('div');
    wrap.className = 'clm-svg-wrap';
    wrap.appendChild(_sunPathSvg(arcs));
    block.appendChild(wrap);
    block.appendChild(_legend(
        arcs.map((a, i) => ({ label: a.label, color: ARC_COLORS[i % ARC_COLORS.length] })),
    ));
    block.appendChild(_note(
        `Polar plot for ${lat.toFixed(2)}°, ${lon.toFixed(2)}° (year ${year}). ` +
        'Centre = zenith, rim = horizon, N is up. Times are UTC.',
    ));
    return block;
}

function _sunPathSvg(arcs: SunArc[]): SVGSVGElement {
    const SIZE = 280;
    const R = 120;
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const svg = _svg(SIZE, SIZE);

    // Horizon disc + altitude rings (30°, 60°).
    for (const altDeg of [0, 30, 60]) {
        const rr = R * (1 - altDeg / 90);
        svg.appendChild(_circle(cx, cy, rr, 'none', 'var(--app-border)', 1));
    }
    // Compass cross + labels.
    svg.appendChild(_line(cx - R, cy, cx + R, cy, 'var(--app-border)', 1));
    svg.appendChild(_line(cx, cy - R, cx, cy + R, 'var(--app-border)', 1));
    svg.appendChild(_text(cx, cy - R - 4, 'N', 10, 'var(--app-text-muted)', 'middle'));
    svg.appendChild(_text(cx, cy + R + 12, 'S', 10, 'var(--app-text-muted)', 'middle'));
    svg.appendChild(_text(cx + R + 8, cy + 3, 'E', 10, 'var(--app-text-muted)', 'middle'));
    svg.appendChild(_text(cx - R - 8, cy + 3, 'W', 10, 'var(--app-text-muted)', 'middle'));

    // Each arc as a polyline of above-horizon samples.
    arcs.forEach((arc, idx) => {
        const color = ARC_COLORS[idx % ARC_COLORS.length];
        const pts: string[] = [];
        for (const p of arc.points) {
            const disc = projectSunToDisc(p.altitudeRad, p.azimuthRad);
            if (!disc) {
                if (pts.length) { _appendPolyline(svg, pts, color); pts.length = 0; }
                continue;
            }
            pts.push(`${(cx + disc.x * R).toFixed(2)},${(cy + disc.y * R).toFixed(2)}`);
        }
        if (pts.length) _appendPolyline(svg, pts, color);
    });
    return svg;
}

function _appendPolyline(svg: SVGSVGElement, pts: string[], color: string): void {
    if (pts.length < 2) return;
    const pl = document.createElementNS(SVG_NS, 'polyline');
    pl.setAttribute('points', pts.join(' '));
    pl.setAttribute('fill', 'none');
    pl.setAttribute('stroke', color);
    pl.setAttribute('stroke-width', '2');
    pl.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(pl);
}

// ── Sub-view: Wind rose ──────────────────────────────────────────────────────

function _windRoseBlock(dataset: ClimateDataset): HTMLElement {
    const block = _block('Wind rose');
    const chart = windRoseBars(dataset.windRose);
    const hasData = chart.maxFrequency > 0;

    const wrap = document.createElement('div');
    wrap.className = 'clm-svg-wrap';
    wrap.appendChild(_windRoseSvg(chart.bars, chart.maxFrequency));
    block.appendChild(wrap);

    if (!hasData) {
        block.appendChild(_note(
            'Wind-rose aggregate is empty — needs an EPW import with hourly wind data.',
            true,
        ));
    } else {
        block.appendChild(_note(
            `Mean ${chart.meanSpeedMps.toFixed(1)} m/s · 99th-pct gust ` +
            `${chart.p99SpeedMps.toFixed(1)} m/s. Bars point FROM the prevailing direction.`,
        ));
    }
    return block;
}

function _windRoseSvg(
    bars: ReturnType<typeof windRoseBars>['bars'],
    maxFreq: number,
): SVGSVGElement {
    const SIZE = 280;
    const R = 110;
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const svg = _svg(SIZE, SIZE);

    // Reference rings.
    for (const frac of [0.33, 0.66, 1]) {
        svg.appendChild(_circle(cx, cy, R * frac, 'none', 'var(--app-border)', 1));
    }
    // Cross + compass labels.
    svg.appendChild(_line(cx - R, cy, cx + R, cy, 'var(--app-border)', 1));
    svg.appendChild(_line(cx, cy - R, cx, cy + R, 'var(--app-border)', 1));
    svg.appendChild(_text(cx, cy - R - 4, 'N', 10, 'var(--app-text-muted)', 'middle'));
    svg.appendChild(_text(cx, cy + R + 12, 'S', 10, 'var(--app-text-muted)', 'middle'));
    svg.appendChild(_text(cx + R + 8, cy + 3, 'E', 10, 'var(--app-text-muted)', 'middle'));
    svg.appendChild(_text(cx - R - 8, cy + 3, 'W', 10, 'var(--app-text-muted)', 'middle'));

    // Radial bars (each a wedge approximated by a thick line to the rim).
    for (const bar of bars) {
        if (bar.frequency <= 0) continue;
        const end = windBarEndpoint(bar.sectorDeg, bar.frequency, maxFreq, R);
        const ln = document.createElementNS(SVG_NS, 'line');
        ln.setAttribute('x1', String(cx));
        ln.setAttribute('y1', String(cy));
        ln.setAttribute('x2', (cx + end.x).toFixed(2));
        ln.setAttribute('y2', (cy + end.y).toFixed(2));
        ln.setAttribute('stroke', ACCENT);
        ln.setAttribute('stroke-width', '9');
        ln.setAttribute('stroke-linecap', 'round');
        ln.setAttribute('opacity', '0.78');
        svg.appendChild(ln);
    }
    void COMPASS_16; // labels available for a future hover affordance
    return svg;
}

// ── Sub-view: Temperature profile ────────────────────────────────────────────

function _tempProfileBlock(dataset: ClimateDataset): HTMLElement {
    const block = _block('Temperature profile (monthly)');
    const series = monthlyTempSeries(dataset);
    const wrap = document.createElement('div');
    wrap.className = 'clm-svg-wrap';
    wrap.appendChild(_tempSvg(series));
    block.appendChild(wrap);
    block.appendChild(_legend([
        { label: 'avg', color: ACCENT },
        { label: 'min–max band', color: '#c4b5fd' },
    ]));
    block.appendChild(_note(
        `Source: ${dataset.source}. Annual range ` +
        `${series.minC.toFixed(0)}°C to ${series.maxC.toFixed(0)}°C.`,
    ));
    return block;
}

function _tempSvg(series: ReturnType<typeof monthlyTempSeries>): SVGSVGElement {
    const W = 290;
    const H = 150;
    const padL = 26;
    const padR = 8;
    const padT = 8;
    const padB = 18;
    const svg = _svg(W, H);

    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const lo = Math.floor(series.minC) - 1;
    const hi = Math.ceil(series.maxC) + 1;
    const span = Math.max(1, hi - lo);

    const xAt = (i: number) => padL + (plotW * i) / 11;
    const yAt = (c: number) => padT + plotH * (1 - (c - lo) / span);

    // Y gridlines + labels (3 ticks).
    for (let k = 0; k <= 2; k += 1) {
        const c = lo + (span * k) / 2;
        const y = yAt(c);
        svg.appendChild(_line(padL, y, W - padR, y, 'var(--app-border)', 1));
        svg.appendChild(_text(padL - 4, y + 3, `${c.toFixed(0)}`, 8, 'var(--app-text-muted)', 'end'));
    }

    // Min–max band as a filled polygon (down the maxes, back up the mins).
    const pts = series.points;
    const top = pts.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.maxC).toFixed(1)}`);
    const bottom = pts
        .map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.minC).toFixed(1)}`)
        .reverse();
    const band = document.createElementNS(SVG_NS, 'polygon');
    band.setAttribute('points', [...top, ...bottom].join(' '));
    band.setAttribute('fill', '#c4b5fd');
    band.setAttribute('opacity', '0.45');
    band.setAttribute('stroke', 'none');
    svg.appendChild(band);

    // Avg line.
    const avg = pts.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.avgC).toFixed(1)}`);
    _appendPolyline(svg, avg, ACCENT);

    // X labels (every other month to avoid crowding).
    pts.forEach((p, i) => {
        if (i % 2 === 0) {
            svg.appendChild(_text(xAt(i), H - 5, p.label, 8, 'var(--app-text-muted)', 'middle'));
        }
    });
    return svg;
}

// ── Small DOM/SVG helpers ────────────────────────────────────────────────────

function _block(titleText: string): HTMLElement {
    const block = document.createElement('div');
    block.className = 'clm-block';
    const t = document.createElement('div');
    t.className = 'clm-block-title';
    t.textContent = titleText;
    block.appendChild(t);
    return block;
}

function _note(text: string, warn = false): HTMLElement {
    const n = document.createElement('div');
    n.className = 'clm-note' + (warn ? ' clm-note--warn' : '');
    n.textContent = text;
    return n;
}

function _legend(items: Array<{ label: string; color: string }>): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'clm-legend';
    for (const it of items) {
        const item = document.createElement('span');
        item.className = 'clm-legend-item';
        const sw = document.createElement('span');
        sw.className = 'clm-legend-swatch';
        sw.style.background = it.color;
        const lbl = document.createElement('span');
        lbl.textContent = it.label;
        item.appendChild(sw);
        item.appendChild(lbl);
        wrap.appendChild(item);
    }
    return wrap;
}

function _emptyState(icon: string, title: string, detail: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'clm-empty';
    const ic = document.createElement('span');
    ic.className = 'clm-empty-icon';
    ic.textContent = icon;
    const t = document.createElement('div');
    t.style.fontWeight = '600';
    t.style.marginBottom = '4px';
    t.textContent = title;
    const d = document.createElement('div');
    d.textContent = detail;
    el.appendChild(ic);
    el.appendChild(t);
    el.appendChild(d);
    return el;
}

function _svg(w: number, h: number): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'clm-svg');
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    return svg;
}

function _circle(
    cx: number, cy: number, r: number,
    fill: string, stroke: string, sw: number,
): SVGCircleElement {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', String(cx));
    c.setAttribute('cy', String(cy));
    c.setAttribute('r', String(r));
    c.setAttribute('fill', fill);
    c.setAttribute('stroke', stroke);
    c.setAttribute('stroke-width', String(sw));
    return c;
}

function _line(
    x1: number, y1: number, x2: number, y2: number,
    stroke: string, sw: number,
): SVGLineElement {
    const l = document.createElementNS(SVG_NS, 'line');
    l.setAttribute('x1', String(x1));
    l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2));
    l.setAttribute('y2', String(y2));
    l.setAttribute('stroke', stroke);
    l.setAttribute('stroke-width', String(sw));
    return l;
}

function _text(
    x: number, y: number, text: string,
    size: number, fill: string, anchor: string,
): SVGTextElement {
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(y));
    t.setAttribute('font-size', String(size));
    t.setAttribute('fill', fill);
    t.setAttribute('text-anchor', anchor);
    t.textContent = text;
    return t;
}
