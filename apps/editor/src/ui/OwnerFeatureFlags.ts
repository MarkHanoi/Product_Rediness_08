/**
 * src/ui/OwnerFeatureFlags.ts
 *
 * Platform Owner Feature Flags — CONTRACT Phase 10
 * Reads/writes localStorage['pryzm-owner-settings'].
 * Singleton exported as OwnerFeatureFlags — safe to import from anywhere.
 *
 * CONTRACT §05 §3 — no bim-* usage.
 * CONTRACT §06 §3 — additive component, no existing code modified.
 */

export interface OwnerSettings {
    showAIPanel:         boolean;  // Default true  — show AI chat panel
    showPhysicsPanel:    boolean;  // Default true  — show physics/structural panel
    showGISPanel:        boolean;  // Default true  — show GIS / mapping panel
    showRenderPanel:     boolean;  // Default true  — show render panel & gallery
    showCollaboration:   boolean;  // Default true  — show collaboration features
    showPricingPage:     boolean;  // Default true  — show public pricing page link
    showStripeUpgrade:   boolean;  // Default true  — show upgrade / Stripe billing flows
    earlyAccessMode:     boolean;  // Default false — display "Early Access" banner
    maintenanceMode:     boolean;  // Default false — disable BIM editor for all users
}

const STORAGE_KEY = 'pryzm-owner-settings';

const DEFAULTS: OwnerSettings = {
    showAIPanel:       true,
    showPhysicsPanel:  true,
    showGISPanel:      true,
    showRenderPanel:   true,
    showCollaboration: true,
    showPricingPage:   true,
    showStripeUpgrade: true,
    earlyAccessMode:   false,
    maintenanceMode:   false,
};

class OwnerFeatureFlagsClass {
    private _settings: OwnerSettings;

    constructor() {
        this._settings = this._load();
    }

    private _load(): OwnerSettings {
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
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this._settings));
        } catch (err) {
            console.warn('[OwnerFeatureFlags] Could not persist settings:', err);
        }
    }

    isEnabled(flag: keyof OwnerSettings): boolean {
        return this._settings[flag];
    }

    setFlag(flag: keyof OwnerSettings, value: boolean): void {
        this._settings[flag] = value;
        this._save();
        console.log(`[OwnerFeatureFlags] ${flag} → ${value}`);
    }

    getAll(): Readonly<OwnerSettings> {
        return { ...this._settings };
    }

    reset(): void {
        this._settings = { ...DEFAULTS };
        this._save();
        console.log('[OwnerFeatureFlags] Reset to defaults');
    }
}

export const OwnerFeatureFlags = new OwnerFeatureFlagsClass();
