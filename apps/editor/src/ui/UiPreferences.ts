/**
 * src/ui/UiPreferences.ts
 *
 * User UI Preferences — CONTRACT §06 §3 (additive component)
 * CSS prefix: none (logic-only module)
 *
 * Persists to localStorage['pryzm-ui-prefs'].
 * Singleton exported as UiPreferences — safe to import from anywhere.
 *
 * Keys:
 *   showRoomDataHints          — IntentPrompt "Why did you make this choice?" toast
 *   showRoomComplianceMessages — Constraint-violation prompts for rooms
 *   showSaveWarningBanner      — Red bottom banner on server-save rejection
 *   showRoomVolumeColour       — Fill 3D height of rooms with their colour (not just floor plane)
 *   roomVolumeOpacity          — Opacity of the 3D room volume fill (0.05 – 0.6, default 0.25)
 *   roomBoundingColumns        — Include column footprints in room detection (default false)
 *   roomBoundingCurtainWalls   — Include curtain walls in room detection (default false)
 *
 * Boolean keys default to false; numeric keys default as documented.
 */

export interface UiPrefsData {
    showRoomDataHints:          boolean;
    showRoomComplianceMessages: boolean;
    showSaveWarningBanner:      boolean;
    /** Room Volume Colour — when true, fills the full 3D height of each room with its colour (not just the floor plane). */
    showRoomVolumeColour:       boolean;
    /** Opacity of the 3D room volume fill when showRoomVolumeColour is enabled. Range 0.05–0.60. */
    roomVolumeOpacity:          number;
    /**
     * Room Bounding — Columns.
     * When true, column rectangular footprint edges participate in room detection topology.
     * Default false — columns are OFF by default per §ROOM-BOUNDING spec.
     */
    roomBoundingColumns:        boolean;
    /**
     * Room Bounding — Curtain Walls.
     * When true, curtain wall segments participate in room boundary detection.
     * Default false — curtain walls are OFF by default per §ROOM-BOUNDING spec.
     * (Previously hardcoded ON; now user-controllable.)
     */
    roomBoundingCurtainWalls:   boolean;
}

const STORAGE_KEY = 'pryzm-ui-prefs';

const DEFAULTS: UiPrefsData = {
    showRoomDataHints:          false,
    showRoomComplianceMessages: false,
    showSaveWarningBanner:      false,
    showRoomVolumeColour:       false,
    roomVolumeOpacity:          0.25,
    roomBoundingColumns:        false,
    roomBoundingCurtainWalls:   false,
};

// Phase B.13 (S73-WIRE) — singleton runtime threading per S72 §16.2 row B.13.
// Same singleton-setter pattern as PanelManager (instance is exported at
// module-load time, so the runtime is injected later by the boot path).
class UiPreferencesClass {
    private _data: UiPrefsData;

    /** Phase B.13 (S73-WIRE) — runtime threaded by boot path via `wireRuntime()`. */
    private _runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null;
    public get runtime(): import('@pryzm/runtime-composer/types').PryzmRuntime | null { return this._runtime; }
    public wireRuntime(rt: import('@pryzm/runtime-composer/types').PryzmRuntime | null): void { this._runtime = rt; }

    constructor() {
        this._data = this._load();
    }

    private _load(): UiPrefsData {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return { ...DEFAULTS };
            return { ...DEFAULTS, ...JSON.parse(raw) };
        } catch {
            return { ...DEFAULTS };
        }
    }

    private _save(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
        } catch (e) {
            console.warn('[UiPreferences] Could not persist:', e);
        }
    }

    get<K extends keyof UiPrefsData>(key: K): UiPrefsData[K] {
        return this._data[key];
    }

    set<K extends keyof UiPrefsData>(key: K, value: UiPrefsData[K]): void {
        this._data[key] = value;
        this._save();
        (window as any).runtime?.events?.emit('pryzm-ui-pref-changed', { key, value }); // F.events.14
        console.log(`[UiPreferences] ${key} → ${value}`);
    }

    getAll(): Readonly<UiPrefsData> {
        return { ...this._data };
    }
}

export const UiPreferences = new UiPreferencesClass();
