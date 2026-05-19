import { HDRI_PRESETS } from '@pryzm/core-app-model/rendering';
import type { EnhancementLevel } from '@pryzm/core-app-model/rendering';

export { HDRI_PRESETS };

export interface LightingPreset {
    id:         string;
    label:      string;
    icon:       string;
    hdriId:     string;
    level:      EnhancementLevel;
    tonemap?:   number;
}

export interface CameraPreset {
    id:         string;
    label:      string;
    icon:       string;
    description: string;
}

export const LIGHTING_PRESETS: LightingPreset[] = [
    { id: 'sunrise',     label: 'Sunrise',     icon: '🌄', hdriId: 'daylight-interior', level: 'high',     tonemap: 4 },
    { id: 'daylight',    label: 'Daylight',    icon: '☀️', hdriId: 'daylight-interior', level: 'high',     tonemap: 4 },
    { id: 'golden-hour', label: 'Golden Hour', icon: '🌅', hdriId: 'evening',            level: 'ultra',    tonemap: 4 },
    { id: 'overcast',    label: 'Overcast',    icon: '☁️', hdriId: 'daylight-overcast',  level: 'high',     tonemap: 2 },
    { id: 'night-warm',  label: 'Night Warm',  icon: '🌙', hdriId: 'studio-warm',        level: 'high',     tonemap: 4 },
    { id: 'studio',      label: 'Studio',      icon: '💡', hdriId: 'studio-neutral',     level: 'standard', tonemap: 1 },
];

export const CAMERA_PRESETS: CameraPreset[] = [
    { id: 'eye-level',      label: 'Eye Level',      icon: '👁',  description: '1.6 m standing — default interior view' },
    { id: 'top-down',       label: 'Top Down',       icon: '⬇️',  description: 'Plan view — look straight down' },
    { id: 'interior-wide',  label: 'Interior Wide',  icon: '🏠',  description: 'Wide angle (75°) — show entire room' },
    { id: 'corner-shot',    label: 'Corner Shot',    icon: '📐',  description: 'Corner angle — classic architectural shot' },
];
