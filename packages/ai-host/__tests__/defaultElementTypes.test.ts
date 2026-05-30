// T1.D — per-room default door + window resolver tests.
// Pins the rules table against accidental edits + verifies the resolver
// behaviour: unordered pair matching, wet-side wins, fallback to editor
// defaults.

import { describe, expect, it } from 'vitest';
import {
    defaultDoorSystemTypeId,
    defaultDoorReason,
    defaultWindowSystemTypeId,
    defaultWindowReason,
    DEFAULT_DOOR_TYPE_ID,
    DEFAULT_WINDOW_TYPE_ID,
} from '../src/workflows/apartmentLayout/resolvers/defaultElementTypes.js';

describe('defaultDoorSystemTypeId (T1.D)', () => {
    it('canonical default is dt-solid-timber', () => {
        expect(DEFAULT_DOOR_TYPE_ID).toBe('dt-solid-timber');
    });

    it('corridor ↔ bathroom → white-primed (privacy)', () => {
        expect(defaultDoorSystemTypeId('corridor', 'bathroom')).toBe('dt-white-primed');
    });

    it('door pair is UNORDERED — bathroom on either side yields white-primed', () => {
        expect(defaultDoorSystemTypeId('corridor', 'bathroom'))
            .toBe(defaultDoorSystemTypeId('bathroom', 'corridor'));
        expect(defaultDoorSystemTypeId('corridor', 'bathroom')).toBe('dt-white-primed');
    });

    it('master ↔ ensuite → white-primed (ensuite is wet)', () => {
        expect(defaultDoorSystemTypeId('master', 'ensuite')).toBe('dt-white-primed');
    });

    it('corridor ↔ wc → white-primed', () => {
        expect(defaultDoorSystemTypeId('corridor', 'wc')).toBe('dt-white-primed');
    });

    it('utility door → white-primed', () => {
        expect(defaultDoorSystemTypeId('corridor', 'utility')).toBe('dt-white-primed');
    });

    it('living ↔ kitchen → glazed-timber half-light', () => {
        expect(defaultDoorSystemTypeId('living', 'kitchen')).toBe('dt-glazed-timber');
        expect(defaultDoorSystemTypeId('kitchen', 'living')).toBe('dt-glazed-timber');
    });

    it('wet rule beats kitchen rule — kitchen ↔ bathroom is privacy door, not glazed', () => {
        // Priority order matters: wet first, then kitchen.
        expect(defaultDoorSystemTypeId('kitchen', 'bathroom')).toBe('dt-white-primed');
    });

    it('corridor ↔ bedroom → solid-timber (editor default)', () => {
        expect(defaultDoorSystemTypeId('corridor', 'bedroom')).toBe(DEFAULT_DOOR_TYPE_ID);
    });

    it('hall ↔ living → solid-timber (front-of-house, residential warmth)', () => {
        expect(defaultDoorSystemTypeId('hall', 'living')).toBe(DEFAULT_DOOR_TYPE_ID);
    });

    it('reason text mirrors the picked id', () => {
        expect(defaultDoorReason('corridor', 'bathroom')).toMatch(/wet-room|privacy/);
        expect(defaultDoorReason('living', 'kitchen')).toMatch(/glazed|sight/);
        expect(defaultDoorReason('corridor', 'bedroom')).toMatch(/editor default/);
    });
});

describe('defaultWindowSystemTypeId (T1.D)', () => {
    it('canonical default is wt-timber-casement', () => {
        expect(DEFAULT_WINDOW_TYPE_ID).toBe('wt-timber-casement');
    });

    it('bathroom + ensuite + wc → uPVC casement (privacy)', () => {
        expect(defaultWindowSystemTypeId('bathroom')).toBe('wt-upvc-casement');
        expect(defaultWindowSystemTypeId('ensuite')).toBe('wt-upvc-casement');
        expect(defaultWindowSystemTypeId('wc')).toBe('wt-upvc-casement');
    });

    it('kitchen → uPVC tilt-turn (over-sink vent)', () => {
        expect(defaultWindowSystemTypeId('kitchen')).toBe('wt-upvc-tilt-turn');
    });

    it('living + bedroom + study → timber-casement (heritage default)', () => {
        for (const t of ['living', 'dining', 'bedroom', 'master', 'study'] as const) {
            expect(defaultWindowSystemTypeId(t)).toBe('wt-timber-casement');
        }
    });

    it('corridor + hall → single-pane', () => {
        expect(defaultWindowSystemTypeId('corridor')).toBe('wt-single-pane');
        expect(defaultWindowSystemTypeId('hall')).toBe('wt-single-pane');
    });

    it('reason text is room-specific and informative', () => {
        expect(defaultWindowReason('kitchen')).toMatch(/tilt-turn|ventilation/);
        expect(defaultWindowReason('bathroom')).toMatch(/privacy|obscure/);
    });
});

describe('default-id catalogue alignment (T1.D)', () => {
    // Sanity: every id this resolver might emit MUST be a known built-in
    // type id in the live catalogues. If the catalogue is renamed, these
    // tests fail loudly here BEFORE the broken id reaches an
    // apartment-generation dispatch where the wall handler would reject it
    // as "unknown systemTypeId".
    //
    // We don't import the live stores (they're in the editor's barrel, not
    // ai-host's) — instead we pin the expected id strings. The DoorTool /
    // WindowTool defaults referenced in the resolver doc-comments are the
    // canonical mirror.
    const KNOWN_DOOR_IDS = new Set([
        'dt-solid-timber', 'dt-white-primed', 'dt-glazed-timber',
        'dt-glazed-aluminium', 'dt-fire-rated-60', 'dt-fire-rated-30',
        'dt-steel-industrial', 'dt-aluminium-commercial',
    ]);
    const KNOWN_WINDOW_IDS = new Set([
        'wt-single-pane', 'wt-timber-casement', 'wt-timber-double-hung',
        'wt-aluminium-commercial', 'wt-upvc-casement', 'wt-upvc-tilt-turn',
        'wt-steel-crittal', 'wt-aluminium-triple-glazed',
    ]);

    it('every door id this resolver emits is in the catalogue', () => {
        const emitted = new Set<string>();
        const types = ['master', 'bedroom', 'living', 'kitchen', 'dining', 'bathroom',
                       'ensuite', 'wc', 'hall', 'corridor', 'study', 'utility'] as const;
        for (const a of types) for (const b of types) emitted.add(defaultDoorSystemTypeId(a, b));
        for (const id of emitted) expect(KNOWN_DOOR_IDS.has(id), `door id ${id}`).toBe(true);
    });

    it('every window id this resolver emits is in the catalogue', () => {
        const emitted = new Set<string>();
        const types = ['master', 'bedroom', 'living', 'kitchen', 'dining', 'bathroom',
                       'ensuite', 'wc', 'hall', 'corridor', 'study', 'utility'] as const;
        for (const t of types) emitted.add(defaultWindowSystemTypeId(t));
        for (const id of emitted) expect(KNOWN_WINDOW_IDS.has(id), `window id ${id}`).toBe(true);
    });
});
