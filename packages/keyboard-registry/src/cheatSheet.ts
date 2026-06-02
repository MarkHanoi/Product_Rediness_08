// A.33.a — cheat-sheet data builder.
//
// Per [C43 §1.3] the `?` overlay in the editor (A.33.b) shows the full
// keyboard surface — sourced from the registry, never hand-curated.
// This module turns the registry into a structured `CheatSheetData`
// the L5 modal renders.

import type { KeyboardShortcut, ShortcutCategory } from './types.js';
import {
    KEYBOARD_REGISTRY,
    CATEGORY_ORDER,
    CATEGORY_LABEL,
} from './registry.js';
import { formatKeyCombo, type Platform } from './format.js';

export interface CheatSheetRow {
    readonly id: string;
    readonly label: string;
    readonly description: string;
    /** Primary combo formatted for display on the active platform. */
    readonly primaryCombo: string;
    /** Alias combos formatted for display, if any. */
    readonly aliasCombos: readonly string[];
    readonly experimental: boolean;
}

export interface CheatSheetSection {
    readonly category: ShortcutCategory;
    readonly displayName: string;
    readonly rows: readonly CheatSheetRow[];
}

export interface CheatSheetData {
    readonly platform: Platform;
    readonly sections: readonly CheatSheetSection[];
    readonly totalShortcuts: number;
}

/**
 * Build the cheat-sheet data for a given platform. Pure — same
 * (registry, platform) → same output. Sections appear in
 * {@link CATEGORY_ORDER}.
 *
 * Experimental shortcuts ARE included (per [C43 §1.3] CI tolerates
 * them but they MUST be marked) — the UI renders them muted.
 */
export function buildCheatSheetData(platform: Platform): CheatSheetData {
    const sections: CheatSheetSection[] = [];
    for (const category of CATEGORY_ORDER) {
        const rows: CheatSheetRow[] = [];
        for (const s of KEYBOARD_REGISTRY) {
            if (s.category !== category) continue;
            rows.push(toRow(s, platform));
        }
        if (rows.length === 0) continue;
        sections.push({
            category,
            displayName: CATEGORY_LABEL[category],
            rows,
        });
    }
    return {
        platform,
        sections,
        totalShortcuts: KEYBOARD_REGISTRY.length,
    };
}

function toRow(s: KeyboardShortcut, platform: Platform): CheatSheetRow {
    return {
        id: s.id,
        label: s.label,
        description: s.description,
        primaryCombo: formatKeyCombo(s.combo, platform),
        aliasCombos: (s.aliases ?? []).map((c) => formatKeyCombo(c, platform)),
        experimental: Boolean(s.experimental),
    };
}
