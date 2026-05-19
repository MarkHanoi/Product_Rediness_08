/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — DataWorkbench (Portfolio Intelligence tab)
 * Phase:             Phase J-3 (World Model Plan V3 — Portfolio World Model)
 * Files Modified:    src/ui/dataworkbench/PortfolioQueryPanel.ts (NEW)
 * Classification:    A
 *
 * Portfolio Intelligence panel: structured + NL queries against the
 * anonymised cross-project benchmark dataset. Completes Phase D-4
 * (NL query interface — deferred from Phase D).
 *
 * Layout:
 *   ┌─ PORTFOLIO INTELLIGENCE ─────────────────────────────────────────────┐
 *   │  Consent toggle  [Share anonymised data for benchmarking: ON/OFF]    │
 *   ├──────────────────────────────────────────────────────────────────────┤
 *   │  Structured query                                                    │
 *   │  Building type: [Hospital ▾]  Room type: [Patient bedroom ▾]        │
 *   │  [Run query]                                                         │
 *   │  ─── Results ─────────────────────────────────────────────────────── │
 *   │  median 14.2m² | p25 12.0m² | p75 16.8m² | n=347                   │
 *   │  Your project vs portfolio: ✅ Above median                          │
 *   ├──────────────────────────────────────────────────────────────────────┤
 *   │  AI Query (D-4)                                                      │
 *   │  [What adjacency patterns correlate with lowest noise complaints?]   │
 *   │  [Ask Claude]                                                        │
 *   │  ─── Response ─────────────────────────────────────────────────────  │
 *   │  Narrative...                                                        │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * CSS class prefix: dw- (DataWorkbench convention)
 */

import {
    fetchBenchmark,
    fetchAllBenchmarks,
    queryPortfolioNL,
    computeProjectRoomStats,
    type PortfolioBenchmark,
} from '@pryzm/persistence-client/portfolio';

// ── Palette ───────────────────────────────────────────────────────────────────

const C = {
    purple:    '#6600FF',
    purpleAlt: '#7C3AED',
    emerald:   '#059669',
    amber:     '#D97706',
    red:       '#DC2626',
    slate:     '#64748B',
    border:    'var(--dw-border,#E5E7EB)',
    text:      'var(--app-text,#1a2035)',
    textMid:   'var(--app-text-2,#5a6a85)',
    textMuted: 'var(--app-text-muted,#7a8aaa)',
    bg:        'var(--dw-bg,#FFFFFF)',
    cardBg:    'var(--dw-item-bg,#F8F9FF)',
};

// ── Building type → common room types ────────────────────────────────────────

const ROOM_OPTIONS: Record<string, string[]> = {
    hospital: ['patient-bedroom', 'icu-bay', 'consulting-room', 'waiting', 'pharmacy', 'operating-theatre'],
    office: ['open-office', 'meeting-room', 'private-office', 'reception', 'breakout', 'server-room'],
    residential: ['bedroom', 'living-room', 'kitchen', 'bathroom', 'dining-room', 'utility-room'],
    school: ['classroom', 'small-teaching-room', 'staff-room', 'library', 'sports-hall'],
    mixed: ['office', 'retail', 'residential', 'lobby', 'plant-room'],
};

const BUILDING_TYPES = Object.keys(ROOM_OPTIONS);

// ── Consent localStorage key ──────────────────────────────────────────────────

const CONSENT_KEY = 'pryzm-portfolio-consent';

function getConsent(): boolean {
    return localStorage.getItem(CONSENT_KEY) === 'true';
}

function setConsent(val: boolean): void {
    localStorage.setItem(CONSENT_KEY, String(val));
    // Also update the snapshot if projectSerializer is available
    try {
        const ps = window.projectSerializer; // TODO(C.3.x): legacy projectSerializer — replace with runtime.persistence serializer
        if (ps?.setShareAnonymisedData) ps.setShareAnonymisedData(val);
    } catch { /* ignore */ }
}

// ── Label helpers ─────────────────────────────────────────────────────────────

function prettyLabel(s: string): string {
    return s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function comparisonBadge(area: number | null, bm: PortfolioBenchmark): string {
    if (area == null) return '<span style="color:#9ca3af">No data</span>';
    if (area >= bm.area_m2.median) return '<span style="color:#059669">✅ Above median</span>';
    if (area >= bm.area_m2.p25)   return '<span style="color:#D97706">⚠️ Above p25</span>';
    return '<span style="color:#DC2626">⚠️ Below p25 — below 25th percentile for this room type</span>';
}

// ── PortfolioQueryPanel ───────────────────────────────────────────────────────

export class PortfolioQueryPanel {
    private _el: HTMLElement;
    private _buildingType = 'hospital';
    private _roomType     = 'patient-bedroom';
    private _resultEl!: HTMLElement;
    private _nlResultEl!: HTMLElement;
    private _nlInput!: HTMLInputElement;
    private _runBtn!: HTMLButtonElement;
    private _nlBtn!: HTMLButtonElement;
    private _consentToggle!: HTMLInputElement;
    private _roomSelect!: HTMLSelectElement;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._el = document.createElement('div');
        this._el.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow-y:auto;padding:0;';
        container.appendChild(this._el);
        this._build();
        console.log('[PortfolioQueryPanel] Initialized');
    }

    refresh(): void {
        // Re-render any project-specific stats if a project is loaded
    }

    // ── Build UI ───────────────────────────────────────────────────────────────

    private _build(): void {
        this._el.innerHTML = '';

        // ── Header ────────────────────────────────────────────────────────
        const hdr = document.createElement('div');
        hdr.style.cssText = `padding:14px 16px 10px;border-bottom:1px solid ${C.border};`;
        hdr.innerHTML = `
            <div style="font-size:13px;font-weight:700;color:${C.text};letter-spacing:0.02em;">PORTFOLIO INTELLIGENCE</div>
            <div style="font-size:11px;color:${C.textMuted};margin-top:2px;">Anonymised benchmarks from consented projects</div>
        `;
        this._el.appendChild(hdr);

        // ── Consent toggle ────────────────────────────────────────────────
        const consentRow = document.createElement('div');
        consentRow.style.cssText = `
            display:flex;align-items:center;gap:10px;padding:10px 16px;
            background:${C.cardBg};border-bottom:1px solid ${C.border};
        `;
        const consentLabel = document.createElement('label');
        consentLabel.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;font-weight:600;color:' + C.textMid;
        this._consentToggle = document.createElement('input');
        this._consentToggle.type = 'checkbox';
        this._consentToggle.checked = getConsent();
        this._consentToggle.style.cssText = 'width:14px;height:14px;accent-color:' + C.purple + ';cursor:pointer;';
        this._consentToggle.addEventListener('change', () => {
            setConsent(this._consentToggle.checked);
            const note = consentRow.querySelector('.consent-note') as HTMLElement;
            if (note) note.textContent = this._consentToggle.checked
                ? '✓ Your anonymised room data contributes to portfolio benchmarks.'
                : 'Opt in to contribute your anonymised room data to improve benchmarks.';
        });
        consentLabel.appendChild(this._consentToggle);
        const consentText = document.createElement('span');
        consentText.textContent = 'Share anonymised data for benchmarking';
        consentLabel.appendChild(consentText);
        consentRow.appendChild(consentLabel);

        const consentNote = document.createElement('div');
        consentNote.className = 'consent-note';
        consentNote.style.cssText = `font-size:10px;color:${C.textMuted};margin-left:auto;max-width:200px;text-align:right;line-height:1.4;`;
        consentNote.textContent = getConsent()
            ? '✓ Your anonymised room data contributes to portfolio benchmarks.'
            : 'Opt in to contribute your anonymised room data to improve benchmarks.';
        consentRow.appendChild(consentNote);
        this._el.appendChild(consentRow);

        // ── Structured query ──────────────────────────────────────────────
        const section1 = this._buildSection('STRUCTURED QUERY', C.purple);
        this._el.appendChild(section1.wrapper);

        // Building type select
        const row1 = document.createElement('div');
        row1.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;';

        const btLabel = document.createElement('label');
        btLabel.style.cssText = 'font-size:11px;font-weight:600;color:' + C.textMid + ';display:flex;flex-direction:column;gap:3px;flex:1;min-width:100px;';
        btLabel.innerHTML = '<span>Building type</span>';
        const btSelect = document.createElement('select');
        btSelect.style.cssText = this._selectStyle();
        BUILDING_TYPES.forEach(bt => {
            const opt = document.createElement('option');
            opt.value = bt;
            opt.textContent = prettyLabel(bt);
            if (bt === this._buildingType) opt.selected = true;
            btSelect.appendChild(opt);
        });
        btSelect.addEventListener('change', () => {
            this._buildingType = btSelect.value;
            this._refreshRoomOptions();
        });
        btLabel.appendChild(btSelect);
        row1.appendChild(btLabel);

        const rtLabel = document.createElement('label');
        rtLabel.style.cssText = 'font-size:11px;font-weight:600;color:' + C.textMid + ';display:flex;flex-direction:column;gap:3px;flex:1;min-width:100px;';
        rtLabel.innerHTML = '<span>Room type</span>';
        this._roomSelect = document.createElement('select');
        this._roomSelect.style.cssText = this._selectStyle();
        this._populateRoomSelect();
        this._roomSelect.addEventListener('change', () => { this._roomType = this._roomSelect.value; });
        rtLabel.appendChild(this._roomSelect);
        row1.appendChild(rtLabel);

        section1.body.appendChild(row1);

        this._runBtn = document.createElement('button');
        this._runBtn.textContent = 'Run query';
        this._runBtn.style.cssText = this._btnStyle(C.purple);
        this._runBtn.addEventListener('click', () => this._runQuery());
        section1.body.appendChild(this._runBtn);

        this._resultEl = document.createElement('div');
        this._resultEl.style.cssText = 'margin-top:10px;';
        this._resultEl.innerHTML = `<div style="font-size:12px;color:${C.textMuted};font-style:italic;">Select building and room type, then run query.</div>`;
        section1.body.appendChild(this._resultEl);

        // ── NL Query (D-4) ────────────────────────────────────────────────
        const section2 = this._buildSection('AI QUERY  (D-4 — NL Portfolio Query)', C.purpleAlt);
        this._el.appendChild(section2.wrapper);

        this._nlInput = document.createElement('input');
        this._nlInput.type = 'text';
        this._nlInput.placeholder = 'e.g. "What adjacency patterns correlate with best daylight performance?"';
        this._nlInput.style.cssText = `
            width:100%;box-sizing:border-box;font-size:12px;padding:7px 10px;
            border:1px solid ${C.border};border-radius:6px;
            color:${C.text};background:${C.bg};
            font-family:var(--app-font,-apple-system,sans-serif);
            margin-bottom:8px;
        `;
        this._nlInput.addEventListener('keydown', e => { if (e.key === 'Enter') this._runNLQuery(); });
        section2.body.appendChild(this._nlInput);

        this._nlBtn = document.createElement('button');
        this._nlBtn.textContent = '✦ Ask Claude';
        this._nlBtn.style.cssText = this._btnStyle(C.purpleAlt);
        this._nlBtn.addEventListener('click', () => this._runNLQuery());
        section2.body.appendChild(this._nlBtn);

        this._nlResultEl = document.createElement('div');
        this._nlResultEl.style.cssText = 'margin-top:10px;';
        section2.body.appendChild(this._nlResultEl);

        // ── All benchmarks preview ────────────────────────────────────────
        const section3 = this._buildSection('AVAILABLE BENCHMARKS', C.slate);
        this._el.appendChild(section3.wrapper);
        this._loadAllBenchmarks(section3.body);
    }

    // ── Structured query ───────────────────────────────────────────────────────

    private async _runQuery(): Promise<void> {
        this._runBtn.disabled = true;
        this._runBtn.textContent = 'Querying…';
        this._resultEl.innerHTML = `<div style="font-size:12px;color:${C.textMuted};">Fetching benchmark data…</div>`;

        try {
            const bm = await fetchBenchmark(this._buildingType, this._roomType);
            if (!bm) {
                this._resultEl.innerHTML = `
                    <div style="font-size:12px;color:${C.amber};padding:8px;background:#FFF8E1;border-radius:6px;">
                        No benchmark available for <b>${prettyLabel(this._roomType)}</b> in <b>${prettyLabel(this._buildingType)}</b> buildings.
                        <br>Benchmark requires at least 10 consented projects.
                    </div>`;
                return;
            }

            // Your project room stats
            const rs = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
            const rooms = rs?.getAll?.() ?? [];
            const stats = computeProjectRoomStats(rooms, this._roomType);

            const syntheticNote = bm.synthetic
                ? `<div style="font-size:10px;color:${C.textMuted};margin-top:4px;">Based on industry standards data (NHS HTM, NDSS, BB98 etc.) — not from aggregated live projects yet.</div>`
                : '';

            this._resultEl.innerHTML = `
                <div style="background:${C.cardBg};border:1px solid ${C.border};border-radius:8px;padding:12px;margin-top:4px;">
                    <div style="font-size:12px;font-weight:700;color:${C.text};margin-bottom:8px;">
                        ${prettyLabel(this._roomType)} — ${prettyLabel(this._buildingType)}
                        <span style="font-size:10px;font-weight:400;color:${C.textMuted};">(n=${bm.sampleSize})</span>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:4px;margin-bottom:8px;">
                        ${['p10','p25','median','p75','p90'].map(k => `
                            <div style="text-align:center;padding:6px;background:${k==='median'?'rgba(102,0,255,0.07)':'#fff'};border-radius:5px;border:1px solid ${C.border};">
                                <div style="font-size:9px;font-weight:600;color:${C.textMuted};text-transform:uppercase;">${k}</div>
                                <div style="font-size:13px;font-weight:700;color:${C.text};margin-top:2px;">${(bm.area_m2 as any)[k].toFixed(1)}m²</div>
                            </div>
                        `).join('')}
                    </div>
                    <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:11px;margin-bottom:6px;">
                        ${bm.compliancePassRate != null ? `<span>Compliance pass: <b>${(bm.compliancePassRate * 100).toFixed(0)}%</b></span>` : ''}
                        ${bm.averageRT60 != null ? `<span>Avg RT60: <b>${bm.averageRT60.toFixed(2)}s</b></span>` : ''}
                        ${bm.averageDaylightFactor != null ? `<span>Avg daylight: <b>${bm.averageDaylightFactor.toFixed(1)}%</b></span>` : ''}
                    </div>
                    ${bm.adjacencyPatterns.length > 0 ? `
                        <div style="font-size:11px;color:${C.textMid};margin-bottom:4px;"><b>Common adjacencies:</b>
                            ${bm.adjacencyPatterns.map(a => `${prettyLabel(a.type)} (${(a.frequency * 100).toFixed(0)}%)`).join(', ')}
                        </div>
                    ` : ''}
                    <div style="font-size:12px;font-weight:600;margin-top:8px;padding-top:8px;border-top:1px solid ${C.border};">
                        Your project vs portfolio: ${comparisonBadge(stats.averageArea_m2, bm)}
                        ${stats.averageArea_m2 != null ? `<span style="font-size:11px;color:${C.textMuted};margin-left:6px;">(avg ${stats.averageArea_m2.toFixed(1)}m²)</span>` : ''}
                    </div>
                    ${syntheticNote}
                </div>`;
        } catch (err: any) {
            this._resultEl.textContent = '';
            const errDiv = document.createElement('div');
            errDiv.style.cssText = `color:${C.red};font-size:12px;`;
            errDiv.textContent = `Query failed: ${String(err?.message ?? err)}`;
            this._resultEl.appendChild(errDiv);
        } finally {
            this._runBtn.disabled = false;
            this._runBtn.textContent = 'Run query';
        }
    }

    // ── NL query (D-4) ────────────────────────────────────────────────────────

    private async _runNLQuery(): Promise<void> {
        const query = this._nlInput.value.trim();
        if (!query) { this._nlInput.focus(); return; }

        this._nlBtn.disabled = true;
        this._nlBtn.textContent = '✦ Asking…';
        this._nlResultEl.innerHTML = `<div style="font-size:12px;color:${C.textMuted};">Claude is analysing the portfolio data…</div>`;

        try {
            const result = await queryPortfolioNL(query, this._buildingType, this._roomType);
            if (result.error) {
                this._nlResultEl.textContent = '';
                const errDiv = document.createElement('div');
                errDiv.style.cssText = `color:${C.red};font-size:12px;`;
                errDiv.textContent = `Error: ${String(result.error)}`;
                this._nlResultEl.appendChild(errDiv);
                return;
            }
            this._nlResultEl.innerHTML = `
                <div style="background:${C.cardBg};border:1px solid ${C.border};border-radius:8px;padding:12px;margin-top:4px;">
                    <div style="font-size:11px;font-weight:600;color:${C.purpleAlt};margin-bottom:6px;">Claude's analysis:</div>
                    <div style="font-size:12px;line-height:1.6;color:${C.text};white-space:pre-wrap;">${result.narrative}</div>
                </div>`;
        } catch (err: any) {
            this._nlResultEl.textContent = '';
            const errDiv = document.createElement('div');
            errDiv.style.cssText = `color:${C.red};font-size:12px;`;
            errDiv.textContent = `NL query failed: ${String(err?.message ?? err)}`;
            this._nlResultEl.appendChild(errDiv);
        } finally {
            this._nlBtn.disabled = false;
            this._nlBtn.textContent = '✦ Ask Claude';
        }
    }

    // ── All benchmarks list ───────────────────────────────────────────────────

    private async _loadAllBenchmarks(container: HTMLElement): Promise<void> {
        container.innerHTML = `<div style="font-size:12px;color:${C.textMuted};">Loading benchmark catalogue…</div>`;
        try {
            const benchmarks = await fetchAllBenchmarks();
            if (benchmarks.length === 0) {
                container.innerHTML = `<div style="font-size:12px;color:${C.textMuted};font-style:italic;">No benchmarks available.</div>`;
                return;
            }
            container.innerHTML = '';

            // Group by building type
            const groups: Record<string, PortfolioBenchmark[]> = {};
            for (const b of benchmarks) {
                if (!groups[b.buildingType]) groups[b.buildingType] = [];
                groups[b.buildingType].push(b);
            }

            for (const [bt, bms] of Object.entries(groups)) {
                const grpEl = document.createElement('div');
                grpEl.style.marginBottom = '10px';
                const grpHdr = document.createElement('div');
                grpHdr.style.cssText = `font-size:10px;font-weight:700;text-transform:uppercase;color:${C.textMuted};letter-spacing:0.06em;margin-bottom:4px;`;
                grpHdr.textContent = prettyLabel(bt);
                grpEl.appendChild(grpHdr);

                for (const bm of bms) {
                    const row = document.createElement('div');
                    row.style.cssText = `
                        display:flex;align-items:center;justify-content:space-between;
                        padding:5px 8px;border-radius:5px;cursor:pointer;
                        background:${C.cardBg};border:1px solid ${C.border};margin-bottom:3px;
                        font-size:11px;transition:background 0.1s;
                    `;
                    row.innerHTML = `
                        <span style="color:${C.text};font-weight:500;">${prettyLabel(bm.roomType)}</span>
                        <span style="color:${C.textMuted};">median ${bm.area_m2.median.toFixed(1)}m² · n=${bm.sampleSize}</span>
                    `;
                    row.addEventListener('click', () => {
                        this._buildingType = bt;
                        this._roomType = bm.roomType;
                        this._runQuery();
                    });
                    row.addEventListener('mouseenter', () => { row.style.background = 'rgba(102,0,255,0.05)'; });
                    row.addEventListener('mouseleave', () => { row.style.background = C.cardBg; });
                    grpEl.appendChild(row);
                }
                container.appendChild(grpEl);
            }
        } catch {
            container.innerHTML = `<div style="font-size:12px;color:${C.red};">Failed to load benchmark catalogue.</div>`;
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private _buildSection(title: string, colour: string): { wrapper: HTMLElement; body: HTMLElement } {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `padding:12px 16px;border-bottom:1px solid ${C.border};`;
        const hdr = document.createElement('div');
        hdr.style.cssText = `font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${colour};margin-bottom:8px;`;
        hdr.textContent = title;
        wrapper.appendChild(hdr);
        const body = document.createElement('div');
        wrapper.appendChild(body);
        return { wrapper, body };
    }

    private _populateRoomSelect(): void {
        this._roomSelect.innerHTML = '';
        const options = ROOM_OPTIONS[this._buildingType] ?? [];
        options.forEach(rt => {
            const opt = document.createElement('option');
            opt.value = rt;
            opt.textContent = prettyLabel(rt);
            if (rt === this._roomType) opt.selected = true;
            this._roomSelect.appendChild(opt);
        });
        if (options.length > 0) this._roomType = options[0];
    }

    private _refreshRoomOptions(): void {
        this._populateRoomSelect();
    }

    private _selectStyle(): string {
        return `
            font-size:11px;padding:5px 8px;border-radius:6px;width:100%;
            border:1px solid var(--dw-border,#E5E7EB);
            background:var(--dw-bg,#fff);color:${C.text};cursor:pointer;
            font-family:var(--app-font,-apple-system,sans-serif);
        `;
    }

    private _btnStyle(colour: string): string {
        return `
            font-size:11px;font-weight:600;padding:6px 14px;border-radius:6px;
            border:1px solid ${colour};background:${colour};color:#fff;
            cursor:pointer;transition:opacity 0.12s;
            font-family:var(--app-font,-apple-system,sans-serif);
        `;
    }
}
