/**
 * VisualizationEnginePanelBuilder.ts
 *
 * Static DOM builder for VisualizationEnginePanel — extracts the HTML/DOM
 * construction so the main panel class stays under 1,200 LOC (WS-B S85-WIRE).
 *
 * Design rules:
 *  - Pure DOM factory — no class state, no store imports.
 *  - Returns the panel HTMLElement without event wiring (caller wires it).
 */

import { HDRI_PRESETS, LIGHTING_PRESETS, CAMERA_PRESETS } from './VisualizationEnginePanelData';
import { sharedRenderingState } from '@pryzm/core-app-model/rendering';

/**
 * Build the VisualizationEnginePanel root DOM element.
 * Event wiring is NOT done here — the caller (VisualizationEnginePanel._wire)
 * is responsible for hooking up event listeners.
 */
export function buildVisualizationPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.id    = 'pryzm-viz-engine-panel';
    panel.className = 'viz-panel';
    panel.style.display = 'none';

    panel.innerHTML = `
        <!-- Header -->
        <div class="viz-header">
            <div class="viz-header-left">
                <span class="viz-header-icon">✦</span>
                <div>
                    <div class="viz-header-title">Scene Setup</div>
                    <div class="viz-header-sub">Lighting · Camera · Post FX</div>
                </div>
            </div>
            <button class="viz-close-btn" aria-label="Close">✕</button>
        </div>

        <!-- Tab nav — Scene Setup: Lighting · Camera · Post FX -->
        <div class="viz-tab-nav">
            <button class="viz-tab-btn viz-tab-btn--active" data-tab="lighting">Lighting</button>
            <button class="viz-tab-btn" data-tab="camera">Camera</button>
            <button class="viz-tab-btn" data-tab="postfx">Post FX</button>
        </div>

        <!-- Tab: Quality — hidden (consolidated into Export Studio presets) -->
        <div class="viz-tab-content" id="viz-tab-quality" style="display:none;">
            <div class="viz-section-label">Enhancement Level</div>
            <div class="viz-quality-grid" id="viz-quality-grid">
                <button class="viz-quality-btn" data-level="off"      title="Raw Three.js — no enhancements">
                    <span class="viz-quality-icon">○</span>
                    <span class="viz-quality-name">Off</span>
                </button>
                <button class="viz-quality-btn" data-level="standard" title="Full PBR + improved shadows">
                    <span class="viz-quality-icon">◑</span>
                    <span class="viz-quality-name">Standard</span>
                </button>
                <button class="viz-quality-btn" data-level="high"     title="Standard + HDRI IBL lighting">
                    <span class="viz-quality-icon">●</span>
                    <span class="viz-quality-name">High</span>
                </button>
                <button class="viz-quality-btn viz-quality-btn--active" data-level="ultra" title="High + local reflection probes">
                    <span class="viz-quality-icon">✦</span>
                    <span class="viz-quality-name">Ultra</span>
                </button>
            </div>

            <div class="viz-section-label" style="margin-top:12px;">Environment (HDRI)</div>
            <select class="viz-select" id="viz-hdri-select">
                ${HDRI_PRESETS.map(p => `
                    <option value="${p.id}">${p.label}</option>
                `).join('')}
            </select>

            <div class="viz-status-bar" id="viz-status-bar">✦ Ultra — PBR · HDRI · Shadows · Probes</div>

            <div class="viz-loader" id="viz-loader" style="display:none;">
                <span class="viz-loader-dot"></span> Loading…
            </div>

            <div class="viz-info-row" id="viz-pipeline-info">
                <div class="viz-info-item"><span class="viz-info-dot viz-info-dot--green"></span>PBR Materials</div>
                <div class="viz-info-item"><span class="viz-info-dot" id="viz-dot-hdri"></span>HDRI IBL</div>
                <div class="viz-info-item"><span class="viz-info-dot" id="viz-dot-probe"></span>Reflections</div>
            </div>

            <!-- Fix 2: Phase 5 pipeline-active notice.
                 Hidden by default; shown by _autoActivateIfNeeded() when WebGPU
                 TSL pipeline is active and quality controls are managed by RPM. -->
            <div class="ph-phase5-notice" style="margin-top:10px;">
                <span class="ph-phase5-notice-icon">ℹ</span>
                <span>WebGPU TSL pipeline active — HDRI and SSGI are managed directly by the renderer. Use the sidebar SSGI / TRAA toggles to adjust.</span>
            </div>
        </div>

        <!-- Tab: Lighting (Section 3) — default active tab -->
        <div class="viz-tab-content" id="viz-tab-lighting">
            <div class="viz-section-label">Lighting Presets (Section 3.4)</div>
            <div class="viz-preset-grid" id="viz-lighting-grid">
                ${LIGHTING_PRESETS.map(p => `
                    <button class="viz-preset-btn" data-preset="${p.id}" title="${p.label}">
                        <span class="viz-preset-icon">${p.icon}</span>
                        <span class="viz-preset-name">${p.label}</span>
                    </button>
                `).join('')}
            </div>

            <div class="viz-section-label" style="margin-top:12px;">HDRI Environment</div>
            <select class="viz-select" id="viz-lighting-hdri-select">
                ${HDRI_PRESETS.map(p => `
                    <option value="${p.id}">${p.label} — ${p.description}</option>
                `).join('')}
            </select>

            <div class="viz-section-label" style="margin-top:12px;">HDRI Intensity</div>
            <div class="viz-slider-row">
                <input type="range" class="viz-slider" id="viz-hdri-intensity"
                    min="0.1" max="3.0" step="0.05" value="1.2" />
                <span class="viz-slider-val" id="viz-hdri-intensity-val">1.2×</span>
            </div>

            <div class="viz-loader" id="viz-lighting-loader" style="display:none;">
                <span class="viz-loader-dot"></span> Applying preset…
            </div>

            <!-- Procedural Sky (Phase 1) -->
            <div style="border-top:1px solid rgba(255,255,255,0.07);margin-top:14px;padding-top:12px;">
                <div class="viz-section-label">Procedural Sky</div>
                <div class="viz-toggle-row" style="border-bottom:none;padding-bottom:0;">
                    <span class="viz-toggle-label">Enable Procedural Sky</span>
                    <label class="viz-toggle-wrap">
                        <input type="checkbox" class="viz-toggle-checkbox" id="viz-sky-toggle" />
                        <span class="viz-toggle-track"><span class="viz-toggle-thumb"></span></span>
                    </label>
                </div>

                <div id="viz-sky-controls" style="display:none;margin-top:10px;flex-direction:column;gap:4px;">
                    <div class="viz-section-label">Sky Preset</div>
                    <div class="viz-sky-preset-grid">
                        <button class="viz-sky-preset-btn" data-sky-preset="sunrise"     title="Very low sun, pink/orange horizon">Sunrise</button>
                        <button class="viz-sky-preset-btn" data-sky-preset="morning"     title="Morning sun, soft blue sky">Morning</button>
                        <button class="viz-sky-preset-btn" data-sky-preset="noon"        title="High noon, bright overhead sun">Noon</button>
                        <button class="viz-sky-preset-btn" data-sky-preset="golden-hour" title="Low sun, warm amber glow">Golden Hr</button>
                        <button class="viz-sky-preset-btn" data-sky-preset="sunset"      title="Sun at 1°, deep orange/red sky">Sunset</button>
                        <button class="viz-sky-preset-btn" data-sky-preset="overcast"    title="Overcast, diffuse grey skylight">Overcast</button>
                        <button class="viz-sky-preset-btn" data-sky-preset="night"       title="Near-black sky — for artificial interior lighting">Night</button>
                    </div>

                    <div class="viz-section-label" style="margin-top:8px;">Sun Elevation</div>
                    <div class="viz-slider-row">
                        <input type="range" class="viz-slider" id="viz-sky-elevation"
                            min="0" max="90" step="1" value="30" />
                        <span class="viz-slider-val" id="viz-sky-elevation-val">30°</span>
                    </div>

                    <div class="viz-section-label">Sun Azimuth</div>
                    <div class="viz-slider-row">
                        <input type="range" class="viz-slider" id="viz-sky-azimuth"
                            min="0" max="360" step="1" value="180" />
                        <span class="viz-slider-val" id="viz-sky-azimuth-val">180°</span>
                    </div>

                    <div class="viz-section-label">Turbidity (Haze)</div>
                    <div class="viz-slider-row">
                        <input type="range" class="viz-slider" id="viz-sky-turbidity"
                            min="0" max="20" step="0.5" value="10" />
                        <span class="viz-slider-val" id="viz-sky-turbidity-val">10</span>
                    </div>
                </div>
            </div>

            <!-- Phase 2 — Real Sun sub-section (moved from standalone sidebar button) -->
            <div style="border-top:1px solid rgba(255,255,255,0.07);margin-top:14px;padding-top:12px;">
                <div class="viz-section-label">Real Sun</div>
                <div class="viz-toggle-row" style="border-bottom:none;padding-bottom:0;">
                    <span class="viz-toggle-label">Enable Physically-Accurate Sun</span>
                    <label class="viz-toggle-wrap">
                        <input type="checkbox" class="viz-toggle-checkbox" id="viz-real-sun-toggle" />
                        <span class="viz-toggle-track"><span class="viz-toggle-thumb"></span></span>
                    </label>
                </div>

                <div id="viz-real-sun-controls" style="display:none;margin-top:10px;flex-direction:column;gap:6px;">
                    <!-- Time of day -->
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span class="viz-section-label" style="margin:0;">Time of Day</span>
                        <span class="viz-slider-val" id="viz-sun-time-display">12:00</span>
                    </div>
                    <input type="range" class="viz-slider" id="viz-sun-time-slider"
                        min="0" max="24" step="0.25" value="12"
                        title="Time of day (0–24 h)" />

                    <!-- Location -->
                    <div style="display:flex;gap:8px;margin-top:4px;">
                        <div style="flex:1;">
                            <div class="viz-section-label" style="margin-bottom:3px;">Latitude</div>
                            <input type="number" class="viz-select" id="viz-sun-lat"
                                style="padding:4px 6px;font-size:11px;"
                                step="0.001" min="-90" max="90"
                                placeholder="40.4168"
                                title="Latitude in decimal degrees" />
                        </div>
                        <div style="flex:1;">
                            <div class="viz-section-label" style="margin-bottom:3px;">Longitude</div>
                            <input type="number" class="viz-select" id="viz-sun-lng"
                                style="padding:4px 6px;font-size:11px;"
                                step="0.001" min="-180" max="180"
                                placeholder="-3.7038"
                                title="Longitude in decimal degrees" />
                        </div>
                    </div>

                    <!-- Live readout -->
                    <div id="viz-sun-status" style="
                        margin-top:4px; padding:6px 8px; background:rgba(0,0,0,0.3);
                        border-radius:4px; font-size:10px; color:#aaa; font-style:italic;
                    ">☀ —</div>
                </div>
            </div>
        </div>

        <!-- Tab: Camera (Section 2) -->
        <div class="viz-tab-content" id="viz-tab-camera" style="display:none;">
            <div class="viz-section-label">Camera Presets (Section 2.2)</div>
            <div class="viz-preset-grid" id="viz-camera-grid">
                ${CAMERA_PRESETS.map(p => `
                    <button class="viz-preset-btn" data-camera="${p.id}" title="${p.description}">
                        <span class="viz-preset-icon">${p.icon}</span>
                        <span class="viz-preset-name">${p.label}</span>
                    </button>
                `).join('')}
            </div>

            <div class="viz-section-label" style="margin-top:12px;">Field of View</div>
            <div class="viz-slider-row">
                <input type="range" class="viz-slider" id="viz-fov-slider"
                    min="20" max="120" step="1" value="50" />
                <span class="viz-slider-val" id="viz-fov-val">50°</span>
            </div>

            <div class="viz-section-label" style="margin-top:12px;">Eye Height</div>
            <div class="viz-slider-row">
                <input type="range" class="viz-slider" id="viz-eye-height-slider"
                    min="0.5" max="5.0" step="0.1" value="1.6" />
                <span class="viz-slider-val" id="viz-eye-height-val">1.6m</span>
            </div>

            <div class="viz-section-label" style="margin-top:12px;">Exposure</div>
            <div class="viz-slider-row">
                <input type="range" class="viz-slider" id="viz-exposure-slider"
                    min="0.1" max="3.0" step="0.05" value="1.0" />
                <span class="viz-slider-val" id="viz-exposure-val">1.0×</span>
            </div>
        </div>

        <!-- Tab: Post FX (Section 5) -->
        <div class="viz-tab-content" id="viz-tab-postfx" style="display:none;">
            <div class="viz-section-label">Tone Mapping</div>
            <select class="viz-select" id="viz-tonemap-select">
                <option value="4">ACES Filmic (recommended)</option>
                <option value="1">Linear</option>
                <option value="2">Reinhard</option>
                <option value="3">Cineon</option>
                <option value="5">AgX</option>
            </select>

            <div class="viz-section-label" style="margin-top:12px;">Exposure</div>
            <div class="viz-slider-row">
                <input type="range" class="viz-slider" id="viz-postfx-exposure"
                    min="0.1" max="3.0" step="0.05" value="1.0" />
                <span class="viz-slider-val" id="viz-postfx-exposure-val">1.0×</span>
            </div>

            <div class="viz-section-label" style="margin-top:12px;">Post-Processing</div>
            <div class="viz-toggle-row">
                <span class="viz-toggle-label">Postproduction (SSAO + Outlines)</span>
                <label class="viz-toggle-wrap">
                    <input type="checkbox" class="viz-toggle-checkbox" id="viz-postpro-toggle" checked />
                    <span class="viz-toggle-track"><span class="viz-toggle-thumb"></span></span>
                </label>
            </div>
            <div class="viz-toggle-row">
                <span class="viz-toggle-label">Edge Outlines</span>
                <label class="viz-toggle-wrap">
                    <input type="checkbox" class="viz-toggle-checkbox" id="viz-outlines-toggle" checked />
                    <span class="viz-toggle-track"><span class="viz-toggle-thumb"></span></span>
                </label>
            </div>
            <div class="viz-toggle-row">
                <span class="viz-toggle-label">SMAA Anti-Aliasing</span>
                <label class="viz-toggle-wrap">
                    <input type="checkbox" class="viz-toggle-checkbox" id="viz-smaa-toggle" checked />
                    <span class="viz-toggle-track"><span class="viz-toggle-thumb"></span></span>
                </label>
            </div>

            <!-- Enhanced Bloom (Phase 2) -->
            <div style="border-top:1px solid rgba(255,255,255,0.07);margin-top:14px;padding-top:12px;">
                <div class="viz-section-label">Enhanced Bloom</div>
                <div class="viz-toggle-row" style="border-bottom:none;padding-bottom:0;">
                    <span class="viz-toggle-label">Unreal Bloom Pass</span>
                    <label class="viz-toggle-wrap">
                        <input type="checkbox" class="viz-toggle-checkbox" id="viz-bloom-toggle" />
                        <span class="viz-toggle-track"><span class="viz-toggle-thumb"></span></span>
                    </label>
                </div>

                <div id="viz-bloom-controls" style="display:none;margin-top:8px;flex-direction:column;gap:2px;">
                    <div style="font-size:9.5px;color:rgba(255,200,80,0.75);padding:4px 0;">
                        ⚠ Bloom takes over rendering — SSAO/Outlines paused while active.
                    </div>
                    <div class="viz-section-label" style="margin-top:6px;">Strength</div>
                    <div class="viz-slider-row">
                        <input type="range" class="viz-slider" id="viz-bloom-strength"
                            min="0" max="3" step="0.05" value="1.0" />
                        <span class="viz-slider-val" id="viz-bloom-strength-val">1.0</span>
                    </div>
                    <div class="viz-section-label">Threshold</div>
                    <div class="viz-slider-row">
                        <input type="range" class="viz-slider" id="viz-bloom-threshold"
                            min="0" max="1" step="0.01" value="0.5" />
                        <span class="viz-slider-val" id="viz-bloom-threshold-val">0.50</span>
                    </div>
                    <div class="viz-section-label">Radius</div>
                    <div class="viz-slider-row">
                        <input type="range" class="viz-slider" id="viz-bloom-radius"
                            min="0" max="1" step="0.01" value="0.4" />
                        <span class="viz-slider-val" id="viz-bloom-radius-val">0.40</span>
                    </div>
                </div>
            </div>

            <!-- Screen-Space GI (Phase 2) -->
            <div style="border-top:1px solid rgba(255,255,255,0.07);margin-top:14px;padding-top:12px;">
                <div class="viz-section-label">Screen-Space GI (SSGI)</div>
                <div class="viz-toggle-row" style="border-bottom:none;padding-bottom:0;">
                    <span class="viz-toggle-label">GTAOPass Ambient Occlusion</span>
                    <label class="viz-toggle-wrap">
                        <input type="checkbox" class="viz-toggle-checkbox" id="viz-ssgi-toggle" />
                        <span class="viz-toggle-track"><span class="viz-toggle-thumb"></span></span>
                    </label>
                </div>

                <div id="viz-ssgi-controls" style="display:none;margin-top:8px;flex-direction:column;gap:2px;">
                    <div style="font-size:9.5px;color:rgba(255,200,80,0.75);padding:4px 0;">
                        ⚠ SSGI takes over rendering — Bloom paused while active.
                    </div>
                    <div class="viz-section-label" style="margin-top:6px;">AO Intensity</div>
                    <div class="viz-slider-row">
                        <input type="range" class="viz-slider" id="viz-ssgi-intensity"
                            min="0" max="1" step="0.05" value="1.0" />
                        <span class="viz-slider-val" id="viz-ssgi-intensity-val">1.00</span>
                    </div>
                    <div class="viz-section-label">Denoise Samples</div>
                    <select class="viz-select" id="viz-ssgi-samples">
                        <option value="8">8 — Fast</option>
                        <option value="16" selected>16 — Balanced</option>
                        <option value="32">32 — Quality</option>
                    </select>
                </div>
            </div>

            <!-- Clearcoat Material Upgrade (Phase 1) -->
            <div style="border-top:1px solid rgba(255,255,255,0.07);margin-top:14px;padding-top:12px;">
                <div class="viz-section-label">Clearcoat Materials</div>
                <div class="viz-toggle-row" style="border-bottom:none;padding-bottom:0;">
                    <span class="viz-toggle-label">Lacquered Metals &amp; Glass SSS</span>
                    <label class="viz-toggle-wrap">
                        <input type="checkbox" class="viz-toggle-checkbox" id="viz-clearcoat-toggle" />
                        <span class="viz-toggle-track"><span class="viz-toggle-thumb"></span></span>
                    </label>
                </div>
                <div id="viz-clearcoat-info" style="display:none;font-size:9.5px;color:rgba(139,92,246,0.75);padding:4px 0 0;">
                    MeshPhysicalMaterial upgrade applied to metal / glass / polished surfaces.
                </div>
            </div>

            <div class="viz-section-label" style="margin-top:14px;">Output</div>
            <div class="viz-postfx-btns">
                <button class="viz-action-btn" id="viz-btn-generate-render">✨ Still Image</button>
                <button class="viz-action-btn viz-action-btn--outline" id="viz-btn-panorama">🌐 360° Panorama</button>
                <button class="viz-action-btn viz-action-btn--outline" id="viz-btn-video">🎬 Video Flythrough</button>
            </div>
        </div>

        <!-- Tab: Render Mode (Phase 3 — absorbed from ViewportRenderModePanel) -->
        <div class="viz-tab-content" id="viz-tab-rendermode" style="display:none;">
            <!-- Status indicator -->
            <div class="viz-rm-status" style="font-size:12px;color:#888;padding:4px 0;">○  Idle</div>

            <!-- Sample progress -->
            <div class="viz-section-label" style="margin-top:8px;">Progress</div>
            <div style="display:flex;flex-direction:column;gap:4px;">
                <div class="viz-rm-progress-track" style="
                    height:6px;background:#2a2a3a;border-radius:3px;overflow:hidden;
                ">
                    <div class="viz-rm-progress-fill" style="
                        height:100%;width:0%;background:linear-gradient(90deg,#7c3aed,#a855f7);
                        border-radius:3px;transition:width 0.2s ease;
                    "></div>
                </div>
                <span class="viz-rm-sample-counter" style="font-size:10px;color:#888;">0 / 1000 samples</span>
            </div>

            <!-- Environment (read-only — set in Lighting tab) -->
            <div class="viz-toggle-row" style="border-bottom:none;padding:6px 0 2px;">
                <span class="viz-toggle-label" style="font-size:10.5px;">Environment</span>
                <span class="viz-rm-hdri-name" style="font-size:10.5px;color:#c4b5fd;font-style:italic;">
                    ${HDRI_PRESETS.find(p => p.id === sharedRenderingState.hdriPresetId)?.label ?? sharedRenderingState.hdriPresetId}
                </span>
            </div>

            <!-- Max samples -->
            <div class="viz-section-label">Max Samples</div>
            <select class="viz-select" id="viz-rm-samples-select">
                <option value="200">200 — Preview</option>
                <option value="500">500 — Medium</option>
                <option value="1000" selected>1000 — High</option>
                <option value="2000">2000 — Ultra</option>
            </select>

            <!-- DOF toggle -->
            <div class="viz-toggle-row" style="margin-top:8px;">
                <span class="viz-toggle-label">Depth of Field</span>
                <label class="viz-toggle-wrap">
                    <input type="checkbox" class="viz-toggle-checkbox" id="viz-rm-dof-toggle" />
                    <span class="viz-toggle-track"><span class="viz-toggle-thumb"></span></span>
                </label>
            </div>

            <!-- DOF controls (visible when DOF is enabled) -->
            <div id="viz-rm-dof-controls" style="display:none;flex-direction:column;gap:2px;margin-top:4px;">
                <div class="viz-section-label">f/stop</div>
                <div class="viz-slider-row">
                    <input type="range" class="viz-slider" id="viz-rm-fstop"
                        min="0.7" max="22" step="0.1" value="2.8" />
                    <span class="viz-slider-val" id="viz-rm-fstop-val">f/2.8</span>
                </div>
                <div class="viz-section-label">Focus Distance</div>
                <div class="viz-slider-row">
                    <input type="range" class="viz-slider" id="viz-rm-focal"
                        min="1" max="100" step="0.5" value="10" />
                    <span class="viz-slider-val" id="viz-rm-focal-val">10.0m</span>
                </div>
                <div class="viz-section-label">Aperture Blades</div>
                <div class="viz-slider-row">
                    <input type="range" class="viz-slider" id="viz-rm-blades"
                        min="0" max="12" step="1" value="6" />
                    <span class="viz-slider-val" id="viz-rm-blades-val">6</span>
                </div>
            </div>

            <!-- Action row -->
            <div style="display:flex;gap:8px;margin-top:12px;">
                <button class="viz-action-btn viz-rm-pause-btn" disabled style="flex:1;">⏸  Pause</button>
                <button class="viz-action-btn viz-action-btn--outline viz-rm-screenshot-btn" disabled
                    style="flex:1;" title="Save current frame as PNG">📷  Save</button>
            </div>

            <!-- Start / Exit path tracing button -->
            <button class="viz-action-btn viz-rm-toggle-btn" style="margin-top:8px;width:100%;">
                ▶  Start Path Tracing
            </button>

            <div style="margin-top:8px;font-size:10px;color:#555;text-align:center;line-height:1.4;">
                Camera movement resets accumulation.<br>Edits auto-exit render mode.
            </div>
        </div>
    `;

    return panel;
}
