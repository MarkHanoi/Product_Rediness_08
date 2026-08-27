// chatFacadeCornerPicker — the "Set facade corners" step for a photograph
// attached in the AI chat.
//
// §FIX-CHAT-CORNERS-ARE-THE-FRONT-DOOR (L-11127) · C108 §3.2 (corners asked for
// EVERY time, never assumed) · §4.3 (an unknown plane ⇒ every downstream
// confidence unknown).
//
// THE DEFECT. The founder attached his photograph in the chat, and the reply's
// own ledger said why nothing of it reached the building:
//
//   "an opening lattice of 5 bay(s) × 7 band(s) — read from your photo,
//    confidence 0.00 (under the 0.50 floor), so the generator uses its own
//    window rhythm"
//
// In the chat there was no corners step at all. The facade plane was therefore
// unknown, C108 §4.3 propagated that to every derived confidence, and the
// mapper's floor dropped the whole lattice. The SAME photograph with four clicked
// corners in the Facade panel reads plane 1.00 and lattice 1.00. The chain from
// photo to wall store was proven end-to-end; this was the one closed door.
//
// WHAT THIS IS. A minimal overlay: the decoded photograph at its working size,
// four clicks clockwise from TOP-LEFT, Escape or Cancel to give up. It resolves a
// `Quad` in the DECODED image's pixel frame — the frame the engine is given (the
// chat runs with `cropEnabled: false` so no stage moves the frame under the
// corners). Same contract as the Facade panel's picker (brief §6 / §23 step 5);
// deliberately not the panel itself, which needs a composed runtime and a rail.
//
// ⛔ ASK, NEVER AUTO-EDIT. Nothing here detects, guesses or defaults. If the
// user cancels, the attachment keeps NO corners and the chip says so.
//
// §RAF166 — the fourth-corner paint deferral goes through the frame bus
// (P3 — Single rAF; `packages/frame-scheduler/src/RafAdapter.ts` is the only
// permitted `requestAnimationFrame` call site) rather than a raw rAF call.

import { getFrameScheduler } from '@pryzm/frame-scheduler';

export interface CornerPoint {
    readonly x: number;
    readonly y: number;
}
export type CornerQuad = readonly [CornerPoint, CornerPoint, CornerPoint, CornerPoint];

export interface CornerPickRequest {
    /** Object URL (or any drawable src) of the photograph. */
    readonly previewUrl: string;
    /** The DECODED working frame the engine will be given. Clicks map into it. */
    readonly imageWidth: number;
    readonly imageHeight: number;
    readonly name: string;
}

const MAX_VIEW_W = 0.9;  // of viewport width
const MAX_VIEW_H = 0.78; // of viewport height

/**
 * Open the picker and resolve the four corners, or `null` when the user cancels.
 *
 * Idempotent per call: builds its own DOM, removes it on resolve. Never throws —
 * an image that fails to load resolves `null` after a named console line, so the
 * chip falls back to "corners not set" rather than a hung overlay.
 */
export function pickFacadeCorners(req: CornerPickRequest): Promise<CornerQuad | null> {
    return new Promise<CornerQuad | null>((resolve) => {
        if (typeof document === 'undefined') { resolve(null); return; }

        const overlay = document.createElement('div');
        overlay.className = 'ai-corner-pick-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-label', 'Set facade corners');
        Object.assign(overlay.style, {
            position: 'fixed', inset: '0', zIndex: '100000',
            background: 'rgba(10, 8, 24, 0.82)', display: 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '10px', padding: '16px', boxSizing: 'border-box',
        } as Partial<CSSStyleDeclaration>);

        const hint = document.createElement('div');
        hint.className = 'ai-corner-pick-hint';
        Object.assign(hint.style, { color: '#fff', font: '600 14px/1.4 system-ui, sans-serif', textAlign: 'center', maxWidth: '90vw' } as Partial<CSSStyleDeclaration>);
        const setHint = (n: number): void => {
            hint.textContent =
                n === 0
                    ? `Click the FOUR corners of the facade on "${req.name}", clockwise from TOP-LEFT. Your corners score 1.00; without them the photo cannot shape the building. Escape to cancel.`
                    : `Corner ${n} of 4 set. ${4 - n} to go — clockwise from top-left. Escape to cancel.`;
        };
        setHint(0);

        // Fit the working frame into the viewport, preserving aspect.
        const vw = Math.max(320, window.innerWidth || 1024);
        const vh = Math.max(240, window.innerHeight || 768);
        const scale = Math.min((vw * MAX_VIEW_W) / req.imageWidth, (vh * MAX_VIEW_H) / req.imageHeight, 1);
        const cw = Math.max(1, Math.round(req.imageWidth * scale));
        const ch = Math.max(1, Math.round(req.imageHeight * scale));

        const canvas = document.createElement('canvas');
        canvas.className = 'ai-corner-pick-canvas';
        canvas.width = cw;
        canvas.height = ch;
        Object.assign(canvas.style, { cursor: 'crosshair', borderRadius: '8px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', background: '#222' } as Partial<CSSStyleDeclaration>);

        const bar = document.createElement('div');
        Object.assign(bar.style, { display: 'flex', gap: '8px' } as Partial<CSSStyleDeclaration>);
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'ai-corner-pick-cancel';
        cancel.textContent = 'Cancel — keep no corners';
        const undo = document.createElement('button');
        undo.type = 'button';
        undo.className = 'ai-corner-pick-undo';
        undo.textContent = 'Undo last corner';
        for (const b of [undo, cancel]) {
            Object.assign(b.style, { padding: '8px 14px', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.08)', color: '#fff', font: '600 13px system-ui, sans-serif', cursor: 'pointer' } as Partial<CSSStyleDeclaration>);
        }
        bar.appendChild(undo);
        bar.appendChild(cancel);

        overlay.appendChild(hint);
        overlay.appendChild(canvas);
        overlay.appendChild(bar);
        document.body.appendChild(overlay);

        const picked: CornerPoint[] = [];
        const img = new Image();
        const ctx = canvas.getContext('2d');

        const draw = (): void => {
            if (!ctx) return;
            ctx.clearRect(0, 0, cw, ch);
            try { ctx.drawImage(img, 0, 0, cw, ch); } catch { /* not yet loaded */ }
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#6600FF';
            ctx.fillStyle = '#6600FF';
            for (let i = 0; i < picked.length; i++) {
                const p = picked[i]!;
                const x = p.x * scale;
                const y = p.y * scale;
                ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
                if (i > 0) {
                    const q = picked[i - 1]!;
                    ctx.beginPath(); ctx.moveTo(q.x * scale, q.y * scale); ctx.lineTo(x, y); ctx.stroke();
                }
            }
            if (picked.length === 4) {
                const a = picked[3]!; const b = picked[0]!;
                ctx.beginPath(); ctx.moveTo(a.x * scale, a.y * scale); ctx.lineTo(b.x * scale, b.y * scale); ctx.stroke();
            }
        };

        let settled = false;
        const finish = (result: CornerQuad | null): void => {
            if (settled) return;
            settled = true;
            window.removeEventListener('keydown', onKey);
            overlay.remove();
            resolve(result);
        };
        const onKey = (ev: KeyboardEvent): void => {
            if (ev.key === 'Escape') { ev.preventDefault(); finish(null); }
        };
        window.addEventListener('keydown', onKey);

        cancel.addEventListener('click', () => finish(null));
        undo.addEventListener('click', () => { picked.pop(); setHint(picked.length); draw(); });
        canvas.addEventListener('click', (ev) => {
            const r = canvas.getBoundingClientRect();
            // Canvas CSS size may differ from its bitmap size; map through both.
            const sx = canvas.width / Math.max(1, r.width);
            const sy = canvas.height / Math.max(1, r.height);
            const cx = (ev.clientX - r.left) * sx;
            const cy = (ev.clientY - r.top) * sy;
            // Canvas pixels → DECODED image pixels (the engine's frame).
            const x = Math.max(0, Math.min(req.imageWidth - 1, cx / scale));
            const y = Math.max(0, Math.min(req.imageHeight - 1, cy / scale));
            picked.push({ x, y });
            setHint(picked.length);
            draw();
            if (picked.length === 4) {
                const quad: CornerQuad = [picked[0]!, picked[1]!, picked[2]!, picked[3]!];
                // Let the fourth point paint before the overlay goes. §RAF166:
                // routed through the frame bus instead of a raw rAF call.
                getFrameScheduler().scheduleOnce('chat-corner-pick-finish', () => finish(quad), 'overlay');
            }
        });

        img.onload = draw;
        img.onerror = () => {
            console.warn('[chat-corners] the photograph could not be drawn for corner picking — keeping no corners');
            finish(null);
        };
        img.src = req.previewUrl;
    });
}
