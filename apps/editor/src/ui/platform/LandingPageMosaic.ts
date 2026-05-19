/**
 * LandingPageMosaic — Figma-style drifting image/video mosaic background
 *
 * Contract compliance:
 *   §05 §5   — CSS in AppTheme.ts (lp- prefix)
 *   §05 §7.6 — No independent <style> injection
 *   §06      — Zero BIM engine interaction; purely presentational
 *
 * Fetches /api/media-list to discover images/videos in docs/Images/.
 * Displays them in 3 horizontally-drifting rows (like Figma's homepage).
 * Falls back to a placeholder grid when no media is available.
 *
 * Drift is pure CSS animation — no JS timers for animation (performant).
 */

import { apiFetch } from '@pryzm/core-app-model';

const MOSAIC_ROWS = 3;
const TILE_HEIGHT = [200, 180, 210]; // px per row
const PLACEHOLDER_COLORS = [
    '#e8edf6', '#dde3f0', '#eef1f8',
    '#f0eaff', '#ede7f6', '#e3dff5',
];

export class LandingPageMosaic {
    private container: HTMLElement;
    private destroyed = false;
    private videoEls: HTMLVideoElement[] = [];

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this.container = container;

        // Wave 1.5c — Render placeholder tiles SYNCHRONOUSLY before fetching
        // /api/media-list.  This eliminates the visible "empty mosaic" gap on
        // mobile between LandingPage mount and fetch resolution.  The user
        // sees the drift animation on coloured tiles immediately, then they
        // are seamlessly swapped for real images when the fetch completes.
        // See `docs/03_PRYZM3/02-ARCHITECTURE.md §6` Stage 1 (mosaic enhances
        // post-paint, never blocks paint).
        this.render([]);
        this.enhance();
    }

    private async enhance(): Promise<void> {
        let files: string[] = [];

        try {
            const res = await apiFetch('/api/media-list');
            if (res.ok) {
                const data = await res.json() as { files: string[] };
                files = data.files ?? [];
            }
        } catch {
            /* server unavailable — keep the placeholder render */
        }

        if (this.destroyed) return;
        if (files.length === 0) return;          // already rendering placeholders
        this.container.innerHTML = '';           // clear placeholder tracks
        this.render(files);
    }

    private render(files: string[]): void {
        const images = files.filter(f => !f.toLowerCase().endsWith('.mp4') && !f.toLowerCase().endsWith('.webm') && !f.toLowerCase().endsWith('.mov'));
        const videos = files.filter(f => f.toLowerCase().endsWith('.mp4') || f.toLowerCase().endsWith('.webm') || f.toLowerCase().endsWith('.mov'));

        for (let row = 0; row < MOSAIC_ROWS; row++) {
            const track = document.createElement('div');
            track.className = `lp-mosaic-track lp-mosaic-track--row${row}`;
            track.setAttribute('aria-hidden', 'true');

            const tileHeight = TILE_HEIGHT[row];
            track.style.height = `${tileHeight}px`;

            const inner = document.createElement('div');
            inner.className = 'lp-mosaic-inner';

            const tiles = this.buildTilesForRow(row, images, videos);
            // Duplicate for seamless loop
            const all = [...tiles, ...tiles];
            all.forEach(tile => inner.appendChild(tile));

            track.appendChild(inner);
            this.container.appendChild(track);
        }
    }

    private buildTilesForRow(row: number, images: string[], videos: string[]): HTMLElement[] {
        const tiles: HTMLElement[] = [];
        const tileHeight = TILE_HEIGHT[row];

        // Combine all media and cycle through with offset per row
        const allMedia = [...images, ...videos];

        if (allMedia.length === 0) {
            // Generate placeholder colored tiles
            for (let i = 0; i < 7; i++) {
                tiles.push(this.makePlaceholderTile(tileHeight, i + row));
            }
            return tiles;
        }

        // Build 8 tiles per row (cycling through available media with offset)
        const offset = row * 2;
        for (let i = 0; i < 8; i++) {
            const idx = (i + offset) % allMedia.length;
            const src = allMedia[idx];
            const isVideo = src.endsWith('.mp4') || src.endsWith('.webm') || src.endsWith('.mov');

            if (isVideo) {
                tiles.push(this.makeVideoTile(src, tileHeight));
            } else {
                // Vary widths: portrait / landscape alternating
                const widthMultiplier = (i % 3 === 0) ? 0.75 : (i % 3 === 1) ? 1.1 : 0.9;
                tiles.push(this.makeImageTile(src, tileHeight, widthMultiplier));
            }
        }

        return tiles;
    }

    private makeImageTile(src: string, height: number, widthMultiplier: number): HTMLElement {
        const el = document.createElement('div');
        el.className = 'lp-mosaic-tile';
        el.style.height = `${height}px`;
        el.style.width = `${Math.round(height * widthMultiplier * 1.35)}px`;
        el.style.flexShrink = '0';

        const img = document.createElement('img');
        img.src = src;
        img.className = 'lp-mosaic-media';
        img.alt = '';
        img.draggable = false;
        // Decode off the main thread — mosaic is decorative, never blocks interaction
        img.decoding = 'async';
        // Low fetch priority — main content (hero copy, nav) loads first
        img.setAttribute('fetchpriority', 'low');
        el.appendChild(img);
        return el;
    }

    private makeVideoTile(src: string, height: number): HTMLElement {
        const el = document.createElement('div');
        el.className = 'lp-mosaic-tile';
        el.style.height = `${height}px`;
        el.style.width = `${Math.round(height * 1.8)}px`;
        el.style.flexShrink = '0';

        const vid = document.createElement('video');
        vid.src = src;
        vid.className = 'lp-mosaic-media';
        vid.autoplay = true;
        vid.muted = true;
        vid.loop = true;
        vid.playsInline = true;
        this.videoEls.push(vid);
        el.appendChild(vid);
        return el;
    }

    private makePlaceholderTile(height: number, index: number): HTMLElement {
        const el = document.createElement('div');
        el.className = 'lp-mosaic-tile lp-mosaic-tile--placeholder';
        el.style.height = `${height}px`;
        el.style.width = `${Math.round(height * 1.2)}px`;
        el.style.flexShrink = '0';
        el.style.background = PLACEHOLDER_COLORS[index % PLACEHOLDER_COLORS.length];
        return el;
    }

    destroy(): void {
        this.destroyed = true;
        this.videoEls.forEach(v => { v.pause(); v.src = ''; });
        this.videoEls = [];
    }
}
