/**
 * @file apps/editor/src/ui/facade/FacadeReconstructionPanel.ts
 *
 * PHOTO -> FACADE GEOMETRY, as a surface the founder can actually use.
 *
 * C108 · ADR-0371 · SPEC-FACADE-RECONSTRUCTION-PIPELINE §4 · L-11000..L-11011
 *
 * ── WHY THIS PANEL IS THE POINT OF THE MILESTONE ────────────────────────────
 * The engine landed at 1bd0e2f5 with 30 corpus cases green and NO WAY TO PUT AN
 * IMAGE IN. `tools/facade-reconstruct/` closed that for a file on disk; this
 * closes it for a photograph in a browser — which is the only path that decodes
 * JPEG/WebP/AVIF/HEIC without a dependency to licence-audit (C108 §7.1, §8.3).
 *
 * ── THE FOUR THINGS THE BRIEF REQUIRES OF THIS SURFACE ──────────────────────
 *  1. §18 — EVERY diagnostic layer, on the uploaded photograph. Visual debugging
 *     is MANDATORY, and against a real building the founder's eye is the only
 *     oracle there is (L-11001 is open: this engine has never seen a real photo).
 *  2. §6/§23 step 5 — MANUAL CORRECTION OF THE FACADE QUAD. Automatic detection
 *     is explicitly allowed to be uncertain, and four user clicks are the
 *     SPECIFIED fallback, not a failure mode. The user's quad always wins.
 *  3. §16 — "SET REFERENCE DIMENSION": click two points, type a length, and the
 *     whole facade converts to metric. ⛔ Until then `scale.status = "unknown"`
 *     and this panel SHOWS it as unknown. There is no third source — no storey
 *     prior, no door prior, no EXIF (C108 §2.2, L-11009).
 *  4. C108 §4 — CONFIDENCE IS FIRST-CLASS. Every measured row carries its own
 *     chip, `null` renders as the word UNKNOWN and never as `0.00`, and the
 *     heatmap paints unknown cells neutral-grey-and-hatched rather than at the
 *     bottom of the ramp. A low-confidence result rendered like a high-confidence
 *     one is the defect family this codebase spent a full day closing.
 *
 * ── WHAT THIS PANEL DOES NOT DO, DELIBERATELY ───────────────────────────────
 * ⛔ It does not commit anything to the model. Milestone 1 ends at the IR; there
 *    is no wall, no window and no command dispatched from here, so the panel
 *    takes no runtime and writes to no store (P6 is satisfied by having nothing
 *    to satisfy it about). Turning the IR into elements is Milestone 2's job and
 *    belongs behind the command bus when it arrives.
 * ⛔ It does not add an attachment control to the AI chat. The chat has none, and
 *    whether it should is a founder decision nobody has made.
 *
 * Contract compliance:
 *   §05 §2.1 — CSS lives in ui/styles/panels/facadeReconstruction.ts (frp- prefix)
 *   §05 §6   — zero bim-* / @thatopen/ui elements; pure native HTML
 *   §05 §7.6 — no independent <style> injection
 *   P2       — no THREE; P4 — no `(window as any)`, the console opener is typed
 */

import {
    applyReferenceDimension,
    reconstructFacade,
    type FacadeDiagnostics,
    type FacadeIR,
    type Point2,
    type Quad,
} from '@pryzm/facade-reconstruction';
import { yieldForProgress } from '@pryzm/frame-scheduler';

import { panelManager } from '../PanelManager';
import { injectAppTheme } from '../styles/AppTheme';
import { FACADE_LAYERS, confidenceCss, type FacadeLayer } from './facadeOverlays';
import { canvasPoint, decodeImageFile, DEFAULT_MAX_LONG_SIDE, type DecodedImage } from './facadeRaster';

const PANEL_ID = 'panel:facade';

type PickMode = 'none' | 'quad' | 'reference';

interface ReferencePick {
    readonly p0: Point2;
    readonly p1: Point2;
    readonly meters: number;
}

/** One readout row: a label, a value, and the confidence behind it (or none). */
interface Row {
    readonly label: string;
    readonly value: string;
    readonly confidence?: number | null;
    /** Rendered as a warning strip beneath the row. */
    readonly caveat?: string;
}

export class FacadeReconstructionPanel {
    public readonly element: HTMLElement;

    private readonly _canvas: HTMLCanvasElement;
    private readonly _canvasNote: HTMLElement;
    private readonly _layerStrip: HTMLElement;
    private readonly _readout: HTMLElement;
    private readonly _notes: HTMLElement;
    private readonly _status: HTMLElement;
    private readonly _confidenceChip: HTMLElement;
    private readonly _hint: HTMLElement;
    private readonly _refForm: HTMLElement;
    private readonly _refInput: HTMLInputElement;
    private readonly _quadButton: HTMLButtonElement;
    private readonly _refButton: HTMLButtonElement;
    private readonly _clearQuadButton: HTMLButtonElement;
    private readonly _autoDetectButton: HTMLButtonElement;

    private _decoded: DecodedImage | null = null;
    private _ir: FacadeIR | null = null;
    private _diagnostics: FacadeDiagnostics | null = null;
    private _quad: Quad | null = null;
    /**
     * ⭐ WHETHER THIS PANEL HAS BEEN GIVEN PERMISSION TO GUESS THE FACADE PLANE.
     *
     * `false` on every newly loaded photograph, and it is the point of the whole
     * flow. The founder ran the first real image on 2026-08-25: automatic detection
     * scored 0.64, his four clicks scored 1.00, and his rectification was visibly
     * better. C108 §4.3 makes an uncertain plane cap EVERY downstream confidence, so
     * a 0.64 plane poisons the entire reading while still looking like an answer —
     * and he asked for "Set facade corners" to become MANDATORY.
     *
     * ⛔ The honest form of mandatory is ASKED FOR EVERY TIME, NEVER ASSUMED. So the
     * panel does not silently auto-detect: it measures what it can WITHOUT a plane,
     * shows the photograph, and arms the four-corner pick. Detection is still
     * reachable — as a LABELLED SHORTCUT the user chooses — and skipping is still
     * possible, because a refusing tool with no way past it is its own defect.
     */
    private _autoDetectPermitted = false;
    private _reference: ReferencePick | null = null;
    private _pickMode: PickMode = 'none';
    private _picked: Point2[] = [];
    /** True when `_picked` holds normalized facade coordinates rather than pixels. */
    private _pickedNormalized = false;
    private _activeLayer = 'crop';
    private _running = false;

    constructor() {
        injectAppTheme();

        this.element = document.createElement('div');
        this.element.className = 'frp-panel';
        this.element.setAttribute('role', 'complementary');
        this.element.setAttribute('aria-label', 'Facade reconstruction from a photograph');

        // ── header ───────────────────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'frp-header';
        const title = document.createElement('span');
        title.className = 'frp-title';
        title.textContent = 'FACADE FROM PHOTO';
        this._confidenceChip = document.createElement('span');
        this._confidenceChip.className = 'frp-chip';
        this._confidenceChip.textContent = 'no image';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'frp-close';
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close facade reconstruction panel');
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => this.close());
        header.append(title, this._confidenceChip, closeBtn);

        // ── toolbar ──────────────────────────────────────────────────────────
        const toolbar = document.createElement('div');
        toolbar.className = 'frp-toolbar';

        const fileLabel = document.createElement('label');
        fileLabel.className = 'frp-btn frp-btn--primary';
        fileLabel.textContent = 'Choose photograph';
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.className = 'frp-file';
        fileInput.addEventListener('change', () => {
            const file = fileInput.files?.[0];
            if (file !== undefined) void this._loadFile(file);
        });
        fileLabel.appendChild(fileInput);

        this._quadButton = this._button('Set facade corners', () => this._beginQuadPick());
        this._clearQuadButton = this._button('Clear corners', () => this._clearQuad());
        this._refButton = this._button('Set reference dimension', () => this._beginReferencePick());
        // ⭐ The labelled shortcut. It says what it costs, because a button called
        // "Auto" that quietly caps every number on the panel is not a choice the
        // user made — it is one that happened to them.
        this._autoDetectButton = this._button('Detect the plane automatically instead', () =>
            this._permitAutoDetect(),
        );
        toolbar.append(
            fileLabel,
            this._quadButton,
            this._autoDetectButton,
            this._clearQuadButton,
            this._refButton,
        );

        // ── hint + status ────────────────────────────────────────────────────
        this._hint = document.createElement('div');
        this._hint.className = 'frp-hint';
        this._status = document.createElement('div');
        this._status.className = 'frp-status';
        this._status.textContent =
            'Pick a photograph of one facade. The image is measured in the browser — nothing is uploaded.';

        // ── the reference-length form, hidden until two points are picked ────
        this._refForm = document.createElement('div');
        this._refForm.className = 'frp-refform frp-hidden';
        const refLabel = document.createElement('span');
        refLabel.textContent = 'Real distance between the two points, in metres:';
        this._refInput = document.createElement('input');
        this._refInput.type = 'number';
        this._refInput.min = '0.001';
        this._refInput.step = '0.01';
        this._refInput.placeholder = '2.1';
        this._refInput.className = 'frp-input';
        this._refInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._applyReference();
        });
        const refApply = this._button('Apply', () => this._applyReference());
        const refCancel = this._button('Cancel', () => this._cancelPick());
        this._refForm.append(refLabel, this._refInput, refApply, refCancel);

        // ── layer strip + canvas ─────────────────────────────────────────────
        this._layerStrip = document.createElement('div');
        this._layerStrip.className = 'frp-layers';
        const stage = document.createElement('div');
        stage.className = 'frp-stage';
        this._canvas = document.createElement('canvas');
        this._canvas.className = 'frp-canvas';
        this._canvas.addEventListener('click', (e) => this._onCanvasClick(e));
        this._canvasNote = document.createElement('div');
        this._canvasNote.className = 'frp-canvasnote';
        stage.append(this._canvas, this._canvasNote);

        // ── readout + notes ──────────────────────────────────────────────────
        this._readout = document.createElement('div');
        this._readout.className = 'frp-readout';
        const notesTitle = document.createElement('div');
        notesTitle.className = 'frp-sectiontitle';
        notesTitle.textContent = 'Stage notes — what each stage did, and what it REFUSED to do';
        this._notes = document.createElement('ul');
        this._notes.className = 'frp-notes';

        const body = document.createElement('div');
        body.className = 'frp-body';
        body.append(
            toolbar,
            this._hint,
            this._refForm,
            this._status,
            this._layerStrip,
            stage,
            this._readout,
            notesTitle,
            this._notes,
        );

        this.element.append(header, body);
        this._buildLayerStrip();
        this._syncButtons();

        panelManager.register(PANEL_ID, () => this.close());
    }

    // ── lifecycle ────────────────────────────────────────────────────────────

    mount(): void {
        // ⚠ `element.isConnected`, NOT a `_mounted` boolean, and a test caught the
        // difference: a flag says what this object once did, while `isConnected`
        // says where the node IS. Anything that clears the body — a workspace mode
        // switch, a project teardown — detaches the panel without telling it, and a
        // flag-guarded mount then silently refuses to re-attach. The button appears
        // to do nothing.
        if (!this.element.isConnected) document.body.appendChild(this.element);
        panelManager.notifyOpened(PANEL_ID);
        this.element.classList.remove('frp-hidden');
    }

    close(): void {
        this.element.classList.add('frp-hidden');
        this._cancelPick();
        panelManager.notifyClosed(PANEL_ID);
    }

    toggle(): void {
        if (this.element.isConnected && !this.element.classList.contains('frp-hidden')) this.close();
        else this.mount();
    }

    // ── loading + running ────────────────────────────────────────────────────

    private async _loadFile(file: File): Promise<void> {
        this._setStatus(`Decoding ${file.name}…`, 'busy');
        let decoded: DecodedImage;
        try {
            decoded = await decodeImageFile(file);
        } catch (e) {
            this._decoded = null;
            this._ir = null;
            this._diagnostics = null;
            this._setStatus((e as Error).message, 'error');
            this._render();
            return;
        }
        await this.loadImage(decoded);
    }

    /**
     * Measure an already-decoded raster.
     *
     * The file picker is one way to get pixels; it is not the only one, and this
     * is the seam a drag-drop handler, a paste handler or a test drives instead.
     * ⭐ It exists because a panel whose ONLY entry point is a `<input type=file>`
     * change event cannot be exercised anywhere a browser is not, which is how a
     * UI ends up asserted by nothing.
     */
    public async loadImage(decoded: DecodedImage): Promise<void> {
        this._decoded = decoded;
        // A new photograph invalidates a quad and a reference picked on the old one.
        this._quad = null;
        this._reference = null;
        // ⛔ AND IT REVOKES PERMISSION TO GUESS. A plane accepted for the previous
        // photograph says nothing about this one.
        this._autoDetectPermitted = false;
        this._activeLayer = 'crop';
        await this._run();
        // ⭐ ASK, DO NOT ASSUME. The pipeline has run far enough to give the user a
        // cropped photograph and an edge map to click on; it has NOT guessed a plane.
        if (this._diagnostics !== null) this._beginQuadPick();
    }

    /**
     * The user's explicit choice to let detection guess the plane (brief §6).
     *
     * ⚠ Not a fallback and not a default — a decision, taken by a person, with the
     * consequence stated on the button and in the status line beneath it.
     */
    private _permitAutoDetect(): void {
        if (this._decoded === null) return;
        this._autoDetectPermitted = true;
        this._quad = null;
        this._cancelPick();
        void this._run();
    }

    /**
     * brief §6 / §23 step 5 — the user's four facade corners, in CROPPED-FRAME
     * pixels, clockwise from top-left. `null` returns to automatic detection.
     *
     * ⭐ The user's quad ALWAYS wins. Automatic detection is explicitly allowed to
     * be uncertain and these four clicks are the SPECIFIED fallback, not a repair
     * for a broken detector.
     */
    public setFacadeQuad(quad: Quad | null): Promise<void> {
        this._quad = quad;
        // ⛔ Clearing the corners returns to ASKING, never to guessing. "Clear" must
        // not be a back door into the behaviour the founder asked to stop.
        if (quad === null) this._autoDetectPermitted = false;
        this._cancelPick();
        return this._run();
    }

    /**
     * brief §16 — two points in NORMALIZED facade coordinates (0..1, Y UP) and the
     * real distance between them in metres.
     *
     * ⛔ The ONLY route by which a metre enters this IR (C108 §2.2, L-11009). The
     * reference is REMEMBERED, so a later re-run (a corrected quad, say) keeps the
     * user's measurement instead of silently reverting the whole facade to
     * normalized units.
     */
    public setReferenceDimension(p0: Point2, p1: Point2, meters: number): void {
        if (this._ir === null) return;
        this._reference = { p0, p1, meters };
        this._ir = this._withReference(this._ir);
        this._render();
    }

    /** The current IR, or `null` when nothing has been measured. */
    public get ir(): FacadeIR | null {
        return this._ir;
    }

    /**
     * The current diagnostics, or `null` when nothing has been measured.
     *
     * ⛔ Kept SEPARATE from `ir` rather than folded into it, because C108 §1.3 says
     * they are separate: diagnostics carry intermediate rasters, and a consumer
     * serialising the IR must never ship one into a project file.
     */
    public get diagnostics(): FacadeDiagnostics | null {
        return this._diagnostics;
    }

    private async _run(): Promise<void> {
        const decoded = this._decoded;
        if (decoded === null || this._running) return;
        this._running = true;
        this._syncButtons();
        const scaleNote =
            decoded.scale < 1
                ? ` (reduced from ${decoded.sourceWidth}×${decoded.sourceHeight} to fit the ` +
                  `${DEFAULT_MAX_LONG_SIDE}px working limit — the IR is normalized, so fractions are ` +
                  'unaffected, but fine surface texture below the new sampling limit is gone)'
                : '';
        this._setStatus(`Measuring ${decoded.image.width}×${decoded.image.height}…${scaleNote}`, 'busy');

        // ⚠ Yield a frame before the synchronous pipeline runs, or the status line
        // above never paints and the panel simply appears to hang. The engine's
        // `async` signature is the seam a worker slides behind later without
        // touching this call site (C108 §5.2).
        //
        // §RAF166 — routed through `yieldForProgress` (the frame-bus yield;
        // `packages/frame-scheduler/src/progressScheduler.ts`) instead of a raw
        // `await new Promise(r => requestAnimationFrame(r))`. Not a mechanical
        // substitution: that raw form is the exact bug class §PROGRESS-SCHEDULER
        // fixed elsewhere — a hidden/backgrounded tab stops firing rAF entirely,
        // so a bare rAF-yield here would park this panel's pipeline forever if
        // the user switched tabs mid-measure. `yieldForProgress` keeps the same
        // next-frame behaviour while visible and falls back to an unclamped
        // macrotask while hidden, so the pipeline always completes. P3 is
        // untouched — no new rAF call site, only the canonical bus API.
        await yieldForProgress('facade-reconstruct-status-paint');

        try {
            const result = await reconstructFacade(decoded.image, {
                facadeQuad: this._quad ?? undefined,
                // ⭐ FALSE until the user either sets four corners or explicitly asks
                // for detection. See `_autoDetectPermitted`.
                autoDetectFacadePlane: this._autoDetectPermitted,
            });
            this._diagnostics = result.diagnostics;
            this._ir = this._withReference(result.ir);
            this._setStatus(
                `Measured ${decoded.image.width}×${decoded.image.height}${scaleNote}.`,
                'ok',
            );
        } catch (e) {
            this._ir = null;
            this._diagnostics = null;
            this._setStatus(`the pipeline threw: ${(e as Error).message}`, 'error');
        } finally {
            this._running = false;
            this._syncButtons();
            this._render();
        }
    }

    /** brief §16 — the ONLY route by which a metre enters this IR. */
    private _withReference(ir: FacadeIR): FacadeIR {
        const ref = this._reference;
        if (ref === null) return ir;
        try {
            return applyReferenceDimension(ir, ref.p0, ref.p1, ref.meters);
        } catch (e) {
            this._reference = null;
            this._setStatus(`reference dimension rejected: ${(e as Error).message}`, 'error');
            return ir;
        }
    }

    // ── picking ──────────────────────────────────────────────────────────────

    private _beginQuadPick(): void {
        if (this._diagnostics === null) return;
        this._pickMode = 'quad';
        this._picked = [];
        this._pickedNormalized = false;
        this._activeLayer = 'crop';
        this._refForm.classList.add('frp-hidden');
        this._setHint(
            'Click the FOUR corners of the facade on the photograph, clockwise from TOP-LEFT. ' +
                'This is asked for EVERY time and never assumed: your corners score 1.00, and a ' +
                'detected plane CAPS every other confidence on this panel (brief §6, C108 §4.3). ' +
                'If you would rather let it guess, use "Detect the plane automatically instead". ' +
                'Press Escape to cancel.',
        );
        this._render();
    }

    private _clearQuad(): void {
        void this.setFacadeQuad(null);
    }

    private _beginReferencePick(): void {
        if (this._diagnostics === null) return;
        if (this._diagnostics.rectified.image === null) {
            // ⛔ An honest refusal, not a disabled button with no explanation. A
            // reference dimension is expressed in NORMALIZED FACADE coordinates,
            // and those do not exist until there is a facade plane to normalize
            // against — so this is a real precondition, not a UI limitation.
            this._setHint(
                'A reference dimension is measured on the RECTIFIED facade, and there is no facade ' +
                    'plane yet. Set the four corners first, then set the reference dimension.',
            );
            return;
        }
        this._pickMode = 'reference';
        this._picked = [];
        this._pickedNormalized = true;
        this._activeLayer = 'rectified';
        this._refForm.classList.add('frp-hidden');
        this._setHint(
            'Click TWO points on the rectified facade whose real-world distance you know — ' +
                'a floor-to-floor height, a door width, a measured band. Press Escape to cancel.',
        );
        this._render();
    }

    private _cancelPick(): void {
        this._pickMode = 'none';
        this._picked = [];
        this._pickedNormalized = false;
        this._refForm.classList.add('frp-hidden');
        this._setHint('');
        this._render();
    }

    private _onCanvasClick(ev: MouseEvent): void {
        if (this._pickMode === 'none' || this._diagnostics === null) return;
        const p = canvasPoint(this._canvas, ev);

        if (this._pickMode === 'quad') {
            this._picked.push(p);
            if (this._picked.length === 4) {
                const quad = [this._picked[0]!, this._picked[1]!, this._picked[2]!, this._picked[3]!] as Quad;
                this._pickMode = 'none';
                this._picked = [];
                this._setHint('');
                void this.setFacadeQuad(quad);
                return;
            }
            this._setHint(`Corner ${this._picked.length} of 4 set. ${4 - this._picked.length} to go.`);
            this._render();
            return;
        }

        // reference: convert canvas pixels -> NORMALIZED facade coordinates.
        // ⚠ The C108 §2.1 flip. The rectified raster counts rows DOWN; the facade
        // coordinate system counts Y UP, and `applyReferenceDimension` measures in
        // the latter. A missed flip here still produces a plausible metre value.
        this._picked.push({
            x: p.x / Math.max(1, this._canvas.width),
            y: 1 - p.y / Math.max(1, this._canvas.height),
        });
        if (this._picked.length === 2) {
            this._pickMode = 'none';
            this._refForm.classList.remove('frp-hidden');
            this._refInput.focus();
            this._setHint('Two points set. Type the real distance between them and press Apply.');
        } else {
            this._setHint('First point set. Click the second.');
        }
        this._render();
    }

    private _applyReference(): void {
        if (this._picked.length !== 2 || this._ir === null) return;
        const meters = Number(this._refInput.value);
        if (!Number.isFinite(meters) || meters <= 0) {
            this._setHint('A reference length must be a positive number of metres.');
            return;
        }
        const p0 = this._picked[0]!;
        const p1 = this._picked[1]!;
        this._picked = [];
        this._pickedNormalized = false;
        this._refForm.classList.add('frp-hidden');
        this._setHint('');
        this.setReferenceDimension(p0, p1, meters);
    }

    // ── rendering ────────────────────────────────────────────────────────────

    private _buildLayerStrip(): void {
        this._layerStrip.replaceChildren();
        for (const layer of FACADE_LAYERS) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'frp-layerbtn';
            b.textContent = layer.label;
            b.title = layer.clause;
            b.dataset['layer'] = layer.id;
            b.addEventListener('click', () => {
                this._activeLayer = layer.id;
                this._render();
            });
            this._layerStrip.appendChild(b);
        }
    }

    private _render(): void {
        for (const b of Array.from(this._layerStrip.children)) {
            b.classList.toggle('frp-layerbtn--active', (b as HTMLElement).dataset['layer'] === this._activeLayer);
        }
        this._renderCanvas();
        this._renderReadout();
        this._renderNotes();
        this._renderConfidenceChip();
        this._syncButtons();
    }

    private _renderCanvas(): void {
        const ir = this._ir;
        const d = this._diagnostics;
        if (ir === null || d === null) {
            this._canvas.width = 1;
            this._canvas.height = 1;
            this._canvasNote.textContent = 'No measurement yet — choose a photograph.';
            return;
        }
        const layer: FacadeLayer = FACADE_LAYERS.find((l) => l.id === this._activeLayer) ?? FACADE_LAYERS[0]!;
        const result = layer.draw(this._canvas, ir, d);
        // ⭐ The failure-vs-empty distinction, in the UI. A blank canvas could mean
        // "nothing found" or "this stage never ran"; the reason line says which.
        this._canvasNote.textContent = result.ok ? layer.clause : result.reason ?? 'this layer could not be drawn.';
        this._canvasNote.classList.toggle('frp-canvasnote--refused', !result.ok);
        this._drawPickMarkers();
    }

    private _drawPickMarkers(): void {
        if (this._picked.length === 0) return;
        const ctx = this._canvas.getContext('2d');
        if (ctx === null) return;
        ctx.fillStyle = '#6600FF';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        for (const p of this._picked) {
            // ⚠ The two pick modes store DIFFERENT coordinate systems, and drawing
            // one in the other's frame puts the marker somewhere plausible and
            // wrong: quad corners are cropped-frame PIXELS, reference points are
            // NORMALIZED facade coordinates with Y UP (C108 §2.1). `_pickedNormalized`
            // records which, rather than being re-derived from UI state.
            const x = this._pickedNormalized ? p.x * this._canvas.width : p.x;
            const y = this._pickedNormalized ? (1 - p.y) * this._canvas.height : p.y;
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    }

    private _renderConfidenceChip(): void {
        const ir = this._ir;
        if (ir === null) {
            this._confidenceChip.textContent = 'no image';
            this._confidenceChip.style.background = 'rgba(154,154,160,0.35)';
            return;
        }
        const c = ir.facade.confidence;
        this._confidenceChip.textContent = c === null ? 'facade plane: UNKNOWN' : `facade plane: ${c.toFixed(2)}`;
        this._confidenceChip.style.background = confidenceCss(c, 0.8);
    }

    private _renderReadout(): void {
        this._readout.replaceChildren();
        const ir = this._ir;
        const d = this._diagnostics;
        if (ir === null || d === null) return;
        const f = ir.facade;
        const bays = f.zones[0]?.cells.length ?? 0;
        const openings = f.zones.reduce((n, z) => n + z.cells.filter((c) => c.opening !== null).length, 0);

        const rows: Row[] = [
            {
                label: 'Facade plane',
                value: d.facadeQuad.status,
                confidence: f.confidence,
                caveat:
                    d.facadeQuad.status === 'needs-user'
                        ? (this._autoDetectPermitted
                              ? 'NO PLANE FOUND, even with detection permitted. '
                              : 'NOT YET SET — the four corners are ASKED FOR, never assumed (brief §6). ') +
                          'Everything below was measured on the UN-RECTIFIED frame, so every derived ' +
                          'confidence is UNKNOWN by propagation (C108 §4.3), and opening detection on a ' +
                          'frame that still contains sky typically finds nothing at all. Set the four ' +
                          'corners, or choose detection explicitly.'
                        : d.facadeQuad.status === 'detected'
                          ? 'AUTO-DETECTED at your request. This confidence CAPS every other one on this ' +
                            'panel (C108 §4.3). Four clicked corners score 1.00.'
                          : undefined,
            },
            {
                label: 'Lattice',
                value:
                    `${f.zones.length} zone(s) × ${bays} bay(s) — from ` +
                    (d.lattice.zones.source === 'openings'
                        ? 'THE DETECTED OPENINGS'
                        : 'the wall projection profile'),
                confidence: f.confidence,
                // ⭐ C108 §3.4 keeps TWO rival measurements alive on purpose, and a
                // disagreement between them is INFORMATION: it is the pipeline
                // saying "the wall says one thing and the windows say another".
                // Reporting only the winner is how a 2 zone × 2 bay lattice on a
                // seven-storey building looked like an answer (L-10971).
                caveat:
                    d.lattice.zones.source === 'projection-profile'
                        ? 'The openings did not support a lattice, so the WALL was used instead: ' +
                          `${d.lattice.zones.refusedReason ?? 'refused'}.`
                        : d.lattice.zones.fromProfile !== f.zones.length ||
                            d.lattice.bays.fromProfile !== bays
                          ? '⚠ THE TWO SOURCES DISAGREE. The wall projection profile reads ' +
                            `${d.lattice.zones.fromProfile} zone(s) × ${d.lattice.bays.fromProfile} bay(s). ` +
                            'The openings were used (C108 §3.4) — compare the "Horizontal zone lines" ' +
                            'layer against the photograph and judge for yourself.'
                          : undefined,
            },
            {
                label: 'Openings',
                value: `${openings} matched · ${f.features.length} feature(s) · ${f.outliers.length} outlier(s)`,
            },
            {
                label: 'Periodicity',
                value: `repeat X ${f.periodicity.repeatX ?? 'UNKNOWN'} · repeat Y ${f.periodicity.repeatY ?? 'UNKNOWN'}`,
                confidence: f.periodicity.confidence,
            },
            {
                label: 'Symmetry',
                value:
                    f.symmetry.axisX === null
                        ? 'UNKNOWN — not assumed to be the centre'
                        : `axis at ${f.symmetry.axisX.toFixed(3)} · score ${f.symmetry.score?.toFixed(2) ?? 'UNKNOWN'}`,
                confidence: f.symmetry.confidence,
            },
            {
                label: 'Curvature',
                value:
                    `left ${fmt(f.curvature.left.normalizedDeviation, 4)} · ` +
                    `right ${fmt(f.curvature.right.normalizedDeviation, 4)}`,
                confidence: f.curvature.left.confidence,
                caveat:
                    'RADIUS is null in Milestone 1 and that is the honest value (C108 §3.9, L-11004). One ' +
                    'uncalibrated image says the edges bend, not by what radius.',
            },
            {
                label: 'Surface',
                value:
                    f.surface.pattern === 'grid'
                        ? `grid, pitch ${fmt(f.surface.scaleX, 4)} × ${fmt(f.surface.scaleY, 4)}`
                        : 'none',
                confidence: f.surface.confidence,
                // ⚠ THE HONEST GAP, STATED WHERE IT IS READ (L-11012). S16 has no
                // corpus case, and when the missing ground truth was built as a probe
                // it FALSIFIED the stage rather than confirming it: with openings
                // present, tile pitches of 5, 8, 10, 16 and 20 px ALL return ~0.20 ×
                // ~0.25 — the 5-bay × 4-storey opening lattice — at confidence
                // 0.69–0.79. Displaying that like a measurement is exactly what this
                // panel must not do, so the row is rendered AND tagged.
                caveat:
                    'UNVERIFIED — this is not a measurement (L-11012). Probed against KNOWN tile ' +
                    'pitches, S16 returns the OPENING LATTICE on any facade with openings, whatever ' +
                    'the real pitch is, and locks onto a 2× or 3× harmonic without them.',
            },
            {
                label: 'Scale',
                value:
                    ir.scale.status === 'user-supplied' && ir.scale.metersPerUnit !== null
                        ? `${ir.scale.metersPerUnit.toFixed(4)} m per normalized unit (user-supplied)`
                        : `UNKNOWN — ${ir.scale.unknownReason ?? 'no reason recorded'}`,
                confidence: ir.scale.confidence,
                caveat:
                    ir.scale.status === 'user-supplied'
                        ? undefined
                        : 'Units are NORMALIZED, not metres. No dimension above is a real-world length. ' +
                          'There is no third source: no storey prior, no door prior, no EXIF (C108 §2.2, L-11009).',
            },
        ];

        for (const row of rows) this._readout.appendChild(this._rowElement(row));

        const standing = document.createElement('div');
        standing.className = 'frp-standing';
        standing.textContent =
            'L-11001 is OPEN: every threshold in this engine was fixed against SYNTHETIC images with known ' +
            'ground truth. A real photograph is the first thing that can falsify it — failures here are the ' +
            'point, not a setback. Protrusion depth is null by design in Milestone 1 (C108 §3.10, L-11005): ' +
            'the soffit band is measured, the depth is not.';
        this._readout.appendChild(standing);
    }

    private _rowElement(row: Row): HTMLElement {
        const el = document.createElement('div');
        el.className = 'frp-row';
        const label = document.createElement('span');
        label.className = 'frp-row-label';
        label.textContent = row.label;
        const value = document.createElement('span');
        value.className = 'frp-row-value';
        value.textContent = row.value;
        el.append(label, value);
        if (row.confidence !== undefined) {
            const chip = document.createElement('span');
            chip.className = 'frp-row-chip';
            // ⛔ `null` prints the WORD, never `0.00`. A zero is the claim "certain
            // this is wrong"; not knowing is a different answer (C62 §1.1).
            chip.textContent = row.confidence === null ? 'UNKNOWN' : row.confidence.toFixed(2);
            chip.style.background = confidenceCss(row.confidence, 0.8);
            el.appendChild(chip);
        }
        if (row.caveat !== undefined) {
            const caveat = document.createElement('div');
            caveat.className = 'frp-row-caveat';
            caveat.textContent = row.caveat;
            el.appendChild(caveat);
        }
        return el;
    }

    private _renderNotes(): void {
        this._notes.replaceChildren();
        for (const n of this._diagnostics?.notes ?? []) {
            const li = document.createElement('li');
            li.textContent = n;
            this._notes.appendChild(li);
        }
    }

    private _syncButtons(): void {
        const hasResult = this._diagnostics !== null && !this._running;
        this._quadButton.disabled = !hasResult;
        this._refButton.disabled = !hasResult;
        this._clearQuadButton.disabled = !hasResult || this._quad === null;
        // The shortcut is offered only while the plane is still being ASKED for.
        // Once corners exist or detection has already been permitted, it is spent.
        this._autoDetectButton.disabled =
            !hasResult || this._autoDetectPermitted || this._quad !== null;
        // ⭐ The primary action while no plane has been established, so the panel
        // LOOKS like it is asking rather than merely being willing to be asked.
        const asking = hasResult && this._quad === null && !this._autoDetectPermitted;
        this._quadButton.classList.toggle('frp-btn--primary', asking);
        this._quadButton.classList.toggle('frp-btn--armed', this._pickMode === 'quad');
        this._refButton.classList.toggle('frp-btn--armed', this._pickMode === 'reference');
        this._canvas.classList.toggle('frp-canvas--picking', this._pickMode !== 'none');
    }

    private _setStatus(text: string, kind: 'ok' | 'busy' | 'error'): void {
        this._status.textContent = text;
        this._status.className = `frp-status frp-status--${kind}`;
    }

    private _setHint(text: string): void {
        this._hint.textContent = text;
        this._hint.classList.toggle('frp-hidden', text === '');
    }

    private _button(label: string, onClick: () => void): HTMLButtonElement {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'frp-btn';
        b.textContent = label;
        b.addEventListener('click', onClick);
        return b;
    }
}

// ── singleton open/close, and the reachability this lane exists to provide ────

let singleton: FacadeReconstructionPanel | null = null;
let escapeHandler: ((e: KeyboardEvent) => void) | null = null;

/** Open (or focus) the facade-from-photo panel. */
export function openFacadeReconstructionPanel(): FacadeReconstructionPanel {
    if (singleton === null) {
        singleton = new FacadeReconstructionPanel();
        escapeHandler = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') singleton?.close();
        };
        document.addEventListener('keydown', escapeHandler);
    }
    singleton.mount();
    return singleton;
}

/** Close it if it is open. */
export function closeFacadeReconstructionPanel(): void {
    singleton?.close();
}

/** Toggle it — the shape the tools rail and the runtime event both call. */
export function toggleFacadeReconstructionPanel(): void {
    if (singleton === null) openFacadeReconstructionPanel();
    else singleton.toggle();
}

declare global {
    interface Window {
        /** Console opener, matching the existing `window.pryzm*` panel pattern. */
        pryzmOpenFacadePanel?: () => void;
    }
}

/**
 * Install the console opener. Idempotent.
 *
 * ⭐ This is a SECOND door, not the door. The panel's real entry point is the
 * "Facade from Photo" button in the Import group of the right tools rail
 * (`ExportRailPanel`) — because a feature reachable only from the console is the
 * authored-but-unreachable shape with a nicer name.
 */
export function installFacadeReconstructionConsole(): void {
    if (typeof window === 'undefined') return;
    window.pryzmOpenFacadePanel = () => {
        openFacadeReconstructionPanel();
    };
}

function fmt(v: number | null, digits: number): string {
    return v === null ? 'UNKNOWN' : v.toFixed(digits);
}
