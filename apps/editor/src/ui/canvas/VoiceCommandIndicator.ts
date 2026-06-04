/**
 * VoiceCommandIndicator — Phase K-1
 *
 * Phase:   K-1 (World Model Plan V3 — Zero-Friction Interface)
 * Contract: docs/00_PRZYM/PRYZM_World_Model_Plan_V3_Complete.md §K-1
 *
 * Injects a microphone button into the platform toolbar.
 *
 * States:
 *   idle        — mic icon, neutral style
 *   listening   — mic icon, pulsing red ring
 *   processing  — spinner, "…"
 *   confirming  — modal: confirmationText + Confirm / Cancel buttons
 *   error       — brief red shake, returns to idle
 *
 * Graceful fallback:
 *   When Web Speech API is unavailable a text input field replaces
 *   the listen-on-mic behaviour.
 *
 * Safety: confirmation modal is the only path to execution.
 *         Pressing Escape cancels.
 */

import { voiceSpatialInterface, type VoiceParsedCommand } from '@pryzm/ai-host';

// ── Style constants ────────────────────────────────────────────────────────────
const BASE_BTN = [
    'display:inline-flex;align-items:center;gap:5px;',
    'padding:5px 10px;font-size:12px;font-weight:600;',
    'border:1px solid rgba(220,38,38,0.3);border-radius:6px;',
    'background:rgba(220,38,38,0.07);color:#DC2626;',
    'cursor:pointer;white-space:nowrap;',
    'font-family:var(--app-font,-apple-system,sans-serif);',
    'transition:background 0.12s,border-color 0.12s;',
].join('');

const OVERLAY_STYLE = [
    'position:fixed;inset:0;z-index:10000;',
    // §PANEL-BACKDROP-UNIFY — shared scrim (was rgba(10,14,26,0.55)).
    'background:var(--pryzm-panel-backdrop);',
    'backdrop-filter:var(--pryzm-panel-backdrop-blur);',
    '-webkit-backdrop-filter:var(--pryzm-panel-backdrop-blur);',
    'display:flex;align-items:center;justify-content:center;',
].join('');

const MODAL_STYLE = [
    'background:#fff;border-radius:14px;padding:28px 32px;',
    'max-width:480px;width:90%;box-shadow:0 24px 60px rgba(0,0,0,0.25);',
    'font-family:var(--app-font,-apple-system,sans-serif);',
].join('');

// ── Confirmation modal ────────────────────────────────────────────────────────

function buildConfirmModal(
    parsed: VoiceParsedCommand,
    onConfirm: () => void,
    onCancel: () => void,
): HTMLElement {
    const overlay = document.createElement('div');
    overlay.id = 'voice-confirm-overlay';
    overlay.style.cssText = OVERLAY_STYLE;

    const modal = document.createElement('div');
    modal.style.cssText = MODAL_STYLE;

    const iconRow = document.createElement('div');
    iconRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:16px;';
    iconRow.innerHTML = `<span style="font-size:22px;">🎙</span><span style="font-size:13px;font-weight:700;color:#1a2035;letter-spacing:0.02em;">VOICE COMMAND</span>`;
    modal.appendChild(iconRow);

    const preview = document.createElement('div');
    preview.style.cssText = 'font-size:16px;font-weight:600;color:#1a2035;margin-bottom:10px;line-height:1.5;';
    preview.textContent = parsed.confirmationText;
    modal.appendChild(preview);

    if (parsed.targets.length > 0) {
        const targets = document.createElement('div');
        targets.style.cssText = 'font-size:11px;color:#7a8aaa;margin-bottom:14px;';
        targets.textContent = `Affects ${parsed.targets.length} element${parsed.targets.length !== 1 ? 's' : ''}: ${parsed.targets.slice(0, 3).join(', ')}${parsed.targets.length > 3 ? ` + ${parsed.targets.length - 3} more` : ''}`;
        modal.appendChild(targets);
    }

    if (parsed.intent === 'clarify' && parsed.clarification) {
        const clarDiv = document.createElement('div');
        clarDiv.style.cssText = 'background:#f0f4ff;border-radius:8px;padding:12px 14px;font-size:13px;color:#3B4A6A;margin-bottom:14px;';
        clarDiv.textContent = parsed.clarification;
        modal.appendChild(clarDiv);
    }

    const isDestructive = ['delete', 'merge', 'demolish'].some(w =>
        parsed.confirmationText.toLowerCase().includes(w)
    );

    let confirmInput: HTMLInputElement | null = null;
    if (isDestructive) {
        const warn = document.createElement('div');
        warn.style.cssText = 'background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;font-size:12px;color:#DC2626;margin-bottom:14px;';
        warn.innerHTML = '<strong>Destructive action.</strong> Type <code style="background:#fee2e2;padding:1px 5px;border-radius:3px;">CONFIRM</code> to proceed.';
        modal.appendChild(warn);

        confirmInput = document.createElement('input');
        confirmInput.type = 'text';
        confirmInput.placeholder = 'Type CONFIRM';
        confirmInput.style.cssText = 'width:100%;box-sizing:border-box;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;margin-bottom:14px;outline:none;';
        modal.appendChild(confirmInput);
    }

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:9px 18px;font-size:13px;font-weight:600;border:1.5px solid #e5e7eb;border-radius:8px;background:#fff;color:#5a6a85;cursor:pointer;';
    cancelBtn.addEventListener('click', onCancel);
    btnRow.appendChild(cancelBtn);

    if (parsed.intent !== 'clarify') {
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = 'Confirm';
        confirmBtn.style.cssText = 'padding:9px 18px;font-size:13px;font-weight:600;border:none;border-radius:8px;background:#6600FF;color:#fff;cursor:pointer;';
        confirmBtn.addEventListener('click', () => {
            if (isDestructive && confirmInput?.value !== 'CONFIRM') {
                confirmInput!.style.borderColor = '#DC2626';
                confirmInput!.focus();
                return;
            }
            onConfirm();
        });
        btnRow.appendChild(confirmBtn);
    }

    modal.appendChild(btnRow);
    overlay.appendChild(modal);

    // Escape key cancels
    const escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { onCancel(); }
    };
    document.addEventListener('keydown', escHandler, { once: true });
    (overlay as any)._escHandler = escHandler;

    return overlay;
}

// ── Text-input fallback ───────────────────────────────────────────────────────

function buildTextFallback(container: HTMLElement): void {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Type a command…';
    input.id = 'voice-text-input';
    input.style.cssText = [
        'width:180px;padding:4px 8px;font-size:12px;',
        'border:1px solid rgba(220,38,38,0.3);border-radius:6px;',
        'background:rgba(220,38,38,0.05);color:#1a2035;outline:none;',
        'font-family:var(--app-font,-apple-system,sans-serif);',
    ].join('');
    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
            const text = input.value.trim();
            input.value = '';
            await voiceSpatialInterface.parseText(text);
        }
    });
    container.appendChild(input);
}

// ── Main class ────────────────────────────────────────────────────────────────

export class VoiceCommandIndicator {
    private _btn!: HTMLButtonElement;
    private _container!: HTMLElement;
    private _modal: HTMLElement | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._mount();
        this._subscribeToInterface();
    }

    private _mount(): void {
        setTimeout(() => {
            const toolbar = document.querySelector('.plat-toolbar') as HTMLElement | null;
            if (!toolbar || document.getElementById('voice-indicator-container')) return;

            const sep = document.createElement('div');
            sep.className = 'plat-divider';
            toolbar.appendChild(sep);

            this._container = document.createElement('div');
            this._container.id = 'voice-indicator-container';
            this._container.style.cssText = 'display:inline-flex;align-items:center;gap:6px;';

            if (voiceSpatialInterface.hasSpeechAPI) {
                this._btn = document.createElement('button');
                this._btn.id = 'voice-mic-btn';
                this._btn.title = 'Voice command (click to speak)';
                this._btn.style.cssText = BASE_BTN;
                this._btn.innerHTML = '🎙 Voice';
                this._btn.addEventListener('click', () => this._onMicClick());
                this._container.appendChild(this._btn);
            } else {
                buildTextFallback(this._container);
            }

            toolbar.appendChild(this._container);
            console.log('[VoiceCommandIndicator] Mounted (speechAPI=' + voiceSpatialInterface.hasSpeechAPI + ')');
        }, 1200);
    }

    private _subscribeToInterface(): void {
        voiceSpatialInterface.subscribe((state, parsed) => {
            this._applyState(state, parsed);
        });
    }

    private _onMicClick(): void {
        const s = voiceSpatialInterface.state;
        if (s === 'idle')      voiceSpatialInterface.startListening();
        else if (s === 'listening') voiceSpatialInterface.stopListening();
    }

    private _applyState(state: string, parsed?: VoiceParsedCommand): void {
        if (!this._btn && !document.getElementById('voice-text-input')) return;

        if (this._btn) {
            switch (state) {
                case 'idle':
                    this._btn.innerHTML = '🎙 Voice';
                    this._btn.style.cssText = BASE_BTN;
                    this._btn.disabled = false;
                    break;
                case 'listening':
                    this._btn.innerHTML = '⏹ Stop';
                    this._btn.style.cssText = BASE_BTN + 'animation:voice-pulse 1s ease infinite;background:rgba(220,38,38,0.18);border-color:rgba(220,38,38,0.7);';
                    this._btn.disabled = false;
                    break;
                case 'processing':
                    this._btn.innerHTML = '⏳ …';
                    this._btn.style.cssText = BASE_BTN + 'opacity:0.7;cursor:default;';
                    this._btn.disabled = true;
                    break;
                case 'error':
                    this._btn.innerHTML = '⚠ Error';
                    this._btn.style.cssText = BASE_BTN + 'background:rgba(220,38,38,0.15);';
                    break;
                case 'confirming':
                    this._btn.innerHTML = '🎙 Voice';
                    this._btn.style.cssText = BASE_BTN;
                    this._btn.disabled = false;
                    break;
            }
        }

        if (state === 'confirming' && parsed) {
            this._showModal(parsed);
        } else if (state !== 'confirming') {
            this._closeModal();
        }
    }

    private _showModal(parsed: VoiceParsedCommand): void {
        this._closeModal();
        this._modal = buildConfirmModal(
            parsed,
            async () => {
                this._closeModal();
                await voiceSpatialInterface.executeConfirmed();
            },
            () => {
                this._closeModal();
                voiceSpatialInterface.cancel();
            },
        );
        document.body.appendChild(this._modal);
    }

    private _closeModal(): void {
        if (this._modal) {
            const h = (this._modal as any)._escHandler;
            if (h) document.removeEventListener('keydown', h);
            this._modal.remove();
            this._modal = null;
        }
    }

}
