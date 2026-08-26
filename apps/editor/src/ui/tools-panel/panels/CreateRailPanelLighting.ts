/**
 * CreateRailPanelLighting.ts
 *
 * Lighting fixture picker panel for the CreateRailPanel — extracted to keep
 * CreateRailPanel.ts under the 1,200 LOC limit (WS-B S85-WIRE).
 *
 * Design rules:
 *  - Pure DOM factory — no class state, no store writes.
 *
 * ── ⭐ §LIGHT102 (L-11424, 2026-08-26) — THE HAND-LIST IS GONE ───────────────
 *
 * This file used to carry a hand-written array of TEN fixture definitions —
 * `{ type, label, description, icon }` × 10 — grouped by hand into three
 * headings. The catalogue holds far more than ten, and every family missing from
 * that array was AUTHORED, PLACEABLE, PARSEABLE AND UNREACHABLE: the tool could
 * build it, the schema accepted it, the properties panel would even offer it as a
 * type change — but nothing in the create rail could start one. Lane LIGHT99
 * measured the gap at **22 of 32 families** (L-11424).
 *
 * It is the same defect the fixture catalogue itself was built to kill, one layer
 * up: AN ENUMERATED LIST THAT MUST BE REMEMBERED RATHER THAN DERIVED. Adding a
 * fixture row correctly — matrix row, photometry, vocabulary, picker registry, 3-D
 * mass, all derived — still left it invisible here, because a human had to
 * remember to type it into this array too.
 *
 * So the panel now READS `BUILT_IN_LIGHTING_TYPES`, the registry that already
 * carries every family's id, name, description and mount class. What remains
 * authored here is genuinely presentational and genuinely cannot be derived:
 *
 *   • the GROUPING and its order — the registry knows `mount`, so the groups are
 *     keyed on mount and a family lands in the right one by construction;
 *   • the ICON — a small, closed cosmetic map from mount + name shape to an
 *     icon name, with a per-mount FALLBACK so a family can never fail to render.
 *     ⛔ It is a decoration table, not a membership list: an unmatched family
 *     still appears, wearing its mount's default icon. That distinction is the
 *     whole point — a missing icon must not silently remove a fixture.
 *
 * ⚠ NOT A NEW VOCABULARY. Nothing here names a fixture id. Grep this file for a
 * `LightingFixtureType` literal: there is none, which is what makes the reachable
 * set equal the registry set by construction rather than by discipline.
 */

import type { LightingFixtureType } from '@pryzm/core-app-model';
import {
    BUILT_IN_LIGHTING_TYPES,
    type LightingMountClass,
} from '@pryzm/geometry-lighting';
import * as PryzmIcons from '../../icons/PryzmIcons';

/**
 * The four mount classes, in the order an architect picks them, with the heading
 * and the placement hint the old hand-written groups carried.
 *
 * ⭐ This is the ONLY list in the file, and it enumerates MOUNT CLASSES — a closed
 * four-value vocabulary owned by `LightingTypeDefinitions` — never fixtures. A
 * thirty-eighth family joins whichever of these four its registry row names.
 */
const MOUNT_GROUPS: readonly {
    mount: LightingMountClass;
    heading: string;
    hint: string;
    /**
     * §OUTDOOR112 — which slice of the mount class this group takes:
     * `'exterior'` = registry rows whose `location` is exterior (the SITE
     * fixtures — bollards, post lights, street luminaires); `'interior'` =
     * everything else (`location` absent counts as interior — the twelve
     * hand-authored families carry none). Splitting on the registry's OWN
     * location field keeps the founder's "Outdoor" section DERIVED: a new
     * exterior floor fixture lands in it by construction, never by hand-listing.
     */
    where?: 'interior' | 'exterior';
    /** Icon used when no name rule below matches — never "no icon". */
    fallbackIcon: string;
}[] = [
    {
        mount: 'ceiling',
        heading: 'Ceiling & Pendant',
        hint: 'Place on ceiling / slab underside',
        fallbackIcon: 'material-symbols:light',
    },
    {
        mount: 'wall',
        heading: 'Wall Mounted',
        hint: 'Place on a wall face',
        fallbackIcon: 'material-symbols:wall-lamp',
    },
    {
        mount: 'floor',
        heading: 'Floor Standing',
        hint: 'Place on floor surface',
        where: 'interior',
        fallbackIcon: 'material-symbols:floor-lamp',
    },
    {
        // §OUTDOOR112 — the founder's five site fixtures, plus the pre-existing
        // exterior bollard, land here BY THEIR REGISTRY LOCATION. Exterior
        // wall-mounted fixtures (wall packs, floods) deliberately STAY in
        // "Wall Mounted": they mount on building walls, and the section is
        // about free-standing SITE fixtures.
        mount: 'floor',
        heading: 'Outdoor & Site',
        hint: 'Free-standing site fixtures — place on ground / floor surface',
        where: 'exterior',
        fallbackIcon: 'material-symbols:floor-lamp',
    },
    {
        mount: 'table',
        heading: 'Table Lamps',
        hint: 'Place on table or bedside surface',
        fallbackIcon: 'material-symbols:table-lamp',
    },
];

/**
 * Cosmetic icon rules, matched against the registry row's NAME (case-insensitive)
 * in order, first match wins.
 *
 * ⛔ DECORATION ONLY. A family that matches nothing here still renders, with its
 * mount group's `fallbackIcon` — the failure mode of an icon gap must be a duller
 * card, never a missing fixture. That is the difference between this table and the
 * hand-list it replaced.
 */
const ICON_RULES: readonly { match: RegExp; icon: string }[] = [
    { match: /pendant|chandelier|dome|capsule|globe/i, icon: 'material-symbols:pendant-lamp' },
    { match: /linear|batten|slot|strip|cove|troffer|panel/i, icon: 'material-symbols:fluorescent' },
    { match: /downlight|spot|track|wash|high bay/i, icon: 'material-symbols:light-group' },
    { match: /floor lamp|bollard/i, icon: 'material-symbols:floor-lamp' },
    { match: /table lamp/i, icon: 'material-symbols:table-lamp' },
    { match: /exit|emergency|marker|step/i, icon: 'material-symbols:emergency-home' },
    { match: /flood|wall pack|sconce|mirror|vanity/i, icon: 'material-symbols:wall-lamp' },
];

function iconFor(name: string, fallback: string): string {
    for (const rule of ICON_RULES) if (rule.match.test(name)) return rule.icon;
    return fallback;
}

/**
 * Build and return the lighting fixture picker panel HTMLElement.
 * Extracted from CreateRailPanel._buildLightingPanel (no class state used).
 */
export function buildLightingPanel(): HTMLElement {
    const root = document.createElement('div');
    root.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 8px;
        overflow-y: auto;
    `;

    type FixtureDef = {
        type: LightingFixtureType;
        label: string;
        description: string;
        icon: string;
    };

    type FixtureGroup = {
        heading: string;
        hint: string;
        items: FixtureDef[];
    };

    // ⭐ DERIVED, not typed. Every registry row lands in exactly one group, keyed
    // on the `mount` the registry itself carries — the same value the photometry
    // table and `FLOOR_MOUNTED_FIXTURES` read, so the card cannot promise a
    // placement the tool will not perform.
    const groups: FixtureGroup[] = MOUNT_GROUPS.map((g) => ({
        heading: g.heading,
        hint: g.hint,
        items: BUILT_IN_LIGHTING_TYPES
            .filter((t) => t.mount === g.mount)
            // §OUTDOOR112 — the interior/exterior slice, from the registry's own
            // `location`. A group with no `where` takes the whole mount class;
            // an absent location counts as interior (the hand-authored twelve).
            .filter((t) => g.where === undefined
                || (g.where === 'exterior') === (t.location === 'exterior'))
            .map((t) => ({
                type: t.id as LightingFixtureType,
                label: t.name,
                description: t.description,
                icon: iconFor(t.name, g.fallbackIcon),
            })),
    })).filter((g) => g.items.length > 0);

    const cardStyle = `
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 10px;
        border-radius: 8px;
        border: 1px solid var(--app-border, #e0e0e0);
        background: var(--app-surface, #f8f8f8);
        cursor: pointer;
        text-align: left;
        width: 100%;
        transition: border-color 0.12s, background 0.12s;
        box-sizing: border-box;
    `;

    const iconBoxStyle = `
        width: 36px;
        height: 36px;
        border-radius: 8px;
        background: var(--app-accent-bg, #f0ebff);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--app-accent, #6600ff);
    `;

    for (const group of groups) {
        // Group heading
        const groupHead = document.createElement('div');
        groupHead.style.cssText = `
            font-size: 9px;
            font-weight: 700;
            color: var(--app-text-muted, #999);
            text-transform: uppercase;
            letter-spacing: 0.07em;
            padding: 8px 2px 3px 2px;
        `;
        groupHead.textContent = group.heading;
        groupHead.title = group.hint;
        root.appendChild(groupHead);

        for (const def of group.items) {
            const card = document.createElement('button');
            card.type = 'button';
            card.style.cssText = cardStyle;
            // §LIGHT102 — the id the card will dispatch, readable by a test without
            // a click. The panel offers what the registry holds; this is how that is
            // asserted rather than asserted about.
            card.dataset.fixtureType = def.type;

            card.addEventListener('mouseenter', () => {
                card.style.borderColor = 'var(--app-accent, #6600ff)';
                card.style.background  = 'var(--app-accent-bg, #f0ebff)';
            });
            card.addEventListener('mouseleave', () => {
                card.style.borderColor = 'var(--app-border, #e0e0e0)';
                card.style.background  = 'var(--app-surface, #f8f8f8)';
            });

            const iconWrap = document.createElement('div');
            iconWrap.style.cssText = iconBoxStyle;
            iconWrap.innerHTML = PryzmIcons.iconFromName(def.icon, 20);
            card.appendChild(iconWrap);

            const textWrap = document.createElement('div');
            textWrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0;';

            const labelEl = document.createElement('div');
            labelEl.style.cssText = 'font-size:11px;font-weight:600;color:var(--app-text,#1a1a1a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            labelEl.textContent = def.label;

            const descEl = document.createElement('div');
            descEl.style.cssText = 'font-size:9px;color:var(--app-text-muted,#888);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            descEl.textContent = def.description;
            descEl.title = def.description;

            textWrap.appendChild(labelEl);
            textWrap.appendChild(descEl);
            card.appendChild(textWrap);

            card.addEventListener('click', () => {
                // §LIGHT121 (L-11900) — route through ToolManager.activateLighting,
                // NOT window.lightingTool directly. Driving the 3D tool by hand
                // bypassed ToolManager entirely, so its active-tool string never
                // became 'lighting' — PlanViewToolOverlay / SvpPlanToolOverlay
                // subscribe to exactly that string to decide which PlanToolHandler
                // to arm, so LightingPlanToolHandler (fully coded, registered, and
                // dead) never activated: the founder's "no preview in plan view".
                // activateLighting mirrors activateFurniture — it stamps the
                // active-fixture-type flag AND arms the 3D tool in one call, so both
                // surfaces are reachable from this one click. TODO(E.lighting.T):
                // still legacy window plumbing under the hood — replace with
                // runtime.tools.activate('lighting', mode) when that lands.
                const tm = window.toolManager;
                if (typeof tm?.activateLighting === 'function') {
                    void tm.activateLighting(def.type);
                    return;
                }
                // Fallback for a runtime where ToolManager isn't wired yet — 3D-only,
                // the pre-existing degraded behaviour.
                const lt = window.lightingTool;
                if (!lt) {
                    console.warn('[CreateRailPanel] lightingTool not ready');
                    return;
                }
                if (typeof lt.setFixtureType === 'function') lt.setFixtureType(def.type);
                window._pryzmActiveLightingType = def.type;
                if (typeof lt.activate === 'function') lt.activate();
            });

            root.appendChild(card);
        }
    }

    // Night mode hint
    const hint = document.createElement('div');
    hint.style.cssText = `
        font-size: 9px;
        color: var(--app-text-muted, #aaa);
        padding: 6px 2px 0 2px;
        border-top: 1px solid var(--app-border, #eee);
        margin-top: 6px;
    `;
    hint.innerHTML = `💡 Activate <strong>Night Mode</strong> (bottom bar) to see light emission.`;
    root.appendChild(hint);

    return root;
}
