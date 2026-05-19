// @migration S90-WIRE — moved from src/dev/debugOverlay.ts
// IFC-layer debug overlay utility; lives in src/services/ alongside apiFetch.
// Used by src/export/ifc/ and src/import/ifc/ to surface DOM debug panels.

export function debug(message: any) {
    const text = typeof message === 'string' ? message : JSON.stringify(message, null, 2);
    if (window.__PRYZM_SHOW_DEBUG_OVERLAY !== true) {
        console.debug(text);
        return;
    }

    let el = document.getElementById('ifc-debug');
    if (!el) {
        el = document.createElement('div');
        el.id = 'ifc-debug';
        el.style.cssText = `
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            max-height: 45%;
            overflow-y: auto;
            background: rgba(0,0,0,0.9);
            color: #00ff88;
            font-family: monospace;
            font-size: 11px;
            padding: 6px;
            z-index: 999999;
            pointer-events: auto;
        `;
        document.body.appendChild(el);
    }

    const line = document.createElement('div');
    line.textContent = text;
    el.appendChild(line);
}
