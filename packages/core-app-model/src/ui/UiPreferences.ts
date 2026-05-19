/**
 * UiPreferences — migrated to @pryzm/core-app-model (Sprint H, 2026-05-10).
 * Original: src/ui/UiPreferences.ts
 *
 * Persists to localStorage['pryzm-ui-prefs'].
 * Singleton exported as UiPreferences — safe to import from anywhere.
 */

export interface UiPrefsData {
    showRoomDataHints:          boolean;
    showRoomComplianceMessages: boolean;
    showSaveWarningBanner:      boolean;
    showRoomVolumeColour:       boolean;
    roomVolumeOpacity:          number;
    roomBoundingColumns:        boolean;
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

class UiPreferencesClass {
    private _data: UiPrefsData;
    private _runtime: unknown = null;

    public get runtime(): unknown { return this._runtime; }
    public wireRuntime(rt: unknown): void { this._runtime = rt; }

    constructor() { this._data = this._load(); }

    private _load(): UiPrefsData {
        try {
            const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
            if (!raw) return { ...DEFAULTS };
            return { ...DEFAULTS, ...JSON.parse(raw) };
        } catch { return { ...DEFAULTS }; }
    }

    private _save(): void {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
            }
        } catch (e) { console.warn('[UiPreferences] Could not persist:', e); }
    }

    get<K extends keyof UiPrefsData>(key: K): UiPrefsData[K] { return this._data[key]; }

    set<K extends keyof UiPrefsData>(key: K, value: UiPrefsData[K]): void {
        this._data[key] = value;
        this._save();
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('pryzm-ui-pref-changed', { detail: { key, value } })); // TODO(TASK-15)
        }
        console.log(`[UiPreferences] ${key} → ${value}`);
    }

    getAll(): Readonly<UiPrefsData> { return { ...this._data }; }
}

export const UiPreferences = new UiPreferencesClass();
