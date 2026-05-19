/**
 * ProjectVisibilitySection — visibility, isolate and selection operations
 * for UnifiedBrowserPanel.
 *
 * Scene traversal uses window.selectionManager?.world?.scene?.three:
 *   TODO(D.13): legacy selectionManager — replace with runtime.selection
 * These methods will route through runtime.visibility.* when Phase D.13 lands.
 * All five scene-traverse methods are P6a+P7 deferred to Phase D.13.
 */

import type { UBPBag }          from './BrowserDataHelpers';
import {
    normalizeStoreyName,
    getLevels,
    getCategoryElements,
    getSubType,
    getElementsForLevel,
    getAllElementIds,
} from './BrowserDataHelpers';

// ── Scene visibility helpers ──────────────────────────────────────────────────

export function applyLevelVisibility(_bag: UBPBag, levelId: string, visible: boolean): void {
    const scene = window.selectionManager?.world?.scene?.three; // TODO(D.13)
    if (!scene) return;

    if (levelId.startsWith('ifc-storey:')) {
        const storeyName = levelId.slice('ifc-storey:'.length);
        const norm = normalizeStoreyName(storeyName);
        scene.traverse((obj: any) => {
            if (obj.userData?.source !== 'ifc-import') return;
            if (normalizeStoreyName(obj.userData?.storeyName ?? '') !== norm) return;
            obj.visible = visible;
        });
        return;
    }

    scene.traverse((obj: any) => {
        if (obj.userData?.levelId !== levelId) return;
        if (obj.userData?.role === 'edges') return;
        obj.visible = visible;
        if (visible) {
            obj.traverse?.((child: any) => {
                if (child !== obj && child.userData?.role === 'edges') {
                    child.visible = false;
                }
            });
        }
    });

    const nativeLevel = getLevels().find(l => String(l.id) === levelId);
    if (nativeLevel) {
        const norm = normalizeStoreyName(nativeLevel.name);
        scene.traverse((obj: any) => {
            if (obj.userData?.source !== 'ifc-import') return;
            if (normalizeStoreyName(obj.userData?.storeyName ?? '') !== norm) return;
            obj.visible = visible;
        });
    }
}

export function applyElementVisibility(_bag: UBPBag, elemId: string, visible: boolean): void {
    const scene = window.selectionManager?.world?.scene?.three; // TODO(D.13)
    if (!scene) return;
    scene.traverse((obj: any) => {
        if (obj.userData?.id !== elemId) return;
        obj.visible = visible;
        if (visible) {
            obj.traverse?.((child: any) => {
                if (child !== obj && child.userData?.role === 'edges') {
                    child.visible = false;
                }
            });
        }
    });
}

// ── Isolate logic ─────────────────────────────────────────────────────────────

export function applyIsolate(bag: UBPBag, targetKey: string, getElemIds: () => string[]): void {
    const scene = window.selectionManager?.world?.scene?.three; // TODO(D.13)
    if (!scene) return;

    if (bag.isolateMode === targetKey) {
        bag.isolateMode = null;
        scene.traverse((obj: any) => {
            if (obj.userData?.role === 'edges') return;
            if (!obj.userData?.id) return;

            const elemId  = String(obj.userData.id);
            let levelId: string;

            if (obj.userData.source === 'ifc-import' && obj.userData.storeyName) {
                const norm = normalizeStoreyName(obj.userData.storeyName);
                const matchingNative = getLevels()
                    .find(l => normalizeStoreyName(l.name) === norm);
                levelId = matchingNative
                    ? String(matchingNative.id)
                    : `ifc-storey:${obj.userData.storeyName}`;
            } else {
                levelId = String(obj.userData.levelId ?? '');
            }

            const lvlVis  = bag.levelVisible.get(levelId)  ?? true;
            const elemVis = bag.elemVisible.get(elemId)     ?? true;
            const typeKey = `${levelId}:${obj.userData.elementType ?? obj.userData.type ?? ''}`;
            const typeVis = bag.typeVisible.get(typeKey) ?? true;
            obj.visible   = bag.buildingVisible && lvlVis && elemVis && typeVis;
        });
    } else {
        bag.isolateMode = targetKey;
        const targetIds = new Set(getElemIds().map(String));
        scene.traverse((obj: any) => {
            if (!obj.userData?.id) return;
            if (obj.userData?.role === 'edges') return;
            obj.visible = targetIds.has(String(obj.userData.id));
        });
    }
    bag.refresh();
}

// ── Override check + reset ────────────────────────────────────────────────────

export function hasAnyOverride(bag: UBPBag): boolean {
    if (bag.isolateMode !== null) return true;
    if (!bag.buildingVisible)    return true;
    for (const v of bag.levelVisible.values())   if (!v) return true;
    for (const v of bag.typeVisible.values())    if (!v) return true;
    for (const v of bag.elemVisible.values())    if (!v) return true;
    for (const v of bag.catVisible.values())     if (!v) return true;
    for (const v of bag.catTypeVisible.values()) if (!v) return true;
    return false;
}

export function resetAllVisibility(bag: UBPBag): void {
    bag.isolateMode     = null;
    bag.buildingVisible = true;
    bag.levelVisible.clear();
    bag.typeVisible.clear();
    bag.elemVisible.clear();
    bag.catVisible.clear();
    bag.catTypeVisible.clear();

    const scene = window.selectionManager?.world?.scene?.three; // TODO(D.13)
    if (scene) {
        scene.traverse((obj: any) => {
            if (obj.userData?.role === 'edges') return;
            if (!obj.userData?.id) return;
            obj.visible = true;
        });
    }

    bag.refresh();
}

// ── Multi-element selection ───────────────────────────────────────────────────

export function selectElements(ids: string[]): void {
    if (ids.length === 0) return;
    const sm = window.selectionManager; // TODO(D.13)
    if (!sm) return;
    if (typeof sm.selectMultiple === 'function') {
        sm.selectMultiple(ids);
    } else if (typeof sm.selectByID === 'function') {
        sm.selectByID(ids[0]);
    }
    window.runtime?.events?.emit('pryzm-select-ids', { ids }); // F.events.16
}

// ── Category visibility helpers ───────────────────────────────────────────────

export function applyCategoryVisibility(bag: UBPBag, catLabel: string, visible: boolean): void {
    bag.catVisible.set(catLabel, visible);
    for (const el of getCategoryElements(bag, catLabel)) {
        const id = String(el.id);
        bag.elemVisible.set(id, visible);
        applyElementVisibility(bag, id, visible);
    }
}

export function applyCategoryTypeVisibility(
    bag: UBPBag,
    catLabel: string,
    typeName: string,
    visible: boolean,
): void {
    const key = `${catLabel}:${typeName}`;
    bag.catTypeVisible.set(key, visible);
    for (const el of getCategoryElements(bag, catLabel)) {
        if (getSubType(catLabel, el) === typeName) {
            const id = String(el.id);
            bag.elemVisible.set(id, visible);
            applyElementVisibility(bag, id, visible);
        }
    }
}

// ── Visibility command handler (AI + browser panel dispatch) ──────────────────

export function handleVisibilityCommand(bag: UBPBag, detail: any): void {
    if (!detail) return;
    const action:    string = (detail.action   ?? '').toLowerCase();
    const target:    string = (detail.target   ?? '').toLowerCase();
    const value:     string = (detail.value    ?? '');
    const subType:   string = (detail.subType  ?? '');
    const minHeight: number = Number(detail.minHeight ?? 0);

    const scene = window.selectionManager?.world?.scene?.three; // TODO(D.13)

    if (target === 'level') {
        const levelId = value;
        const ids = getElementsForLevel(bag, levelId).map(el => String(el.id));
        if (action === 'hide') {
            bag.levelVisible.set(levelId, false);
            applyLevelVisibility(bag, levelId, false);
        } else if (action === 'isolate') {
            applyIsolate(bag, `level:${levelId}`, () => ids);
        } else if (action === 'highlight') {
            selectElements(ids);
        }

    } else if (target === 'category') {
        let elements = getCategoryElements(bag, value);
        if (minHeight > 0) {
            elements = elements.filter(el => {
                const h = el.height ?? el.properties?.height ?? el.dimensions?.height ?? 0;
                return Number(h) >= minHeight;
            });
        }
        const ids = elements.map(el => String(el.id));
        if (action === 'hide') {
            applyCategoryVisibility(bag, value, false);
        } else if (action === 'isolate') {
            applyIsolate(bag, `cat:${value}${minHeight ? `:h>${minHeight}` : ''}`, () => ids);
        } else if (action === 'highlight') {
            selectElements(ids);
        }

    } else if (target === 'type-in-category') {
        let elements = getCategoryElements(bag, value)
            .filter(el => getSubType(value, el).toLowerCase() === subType.toLowerCase());
        if (minHeight > 0) {
            elements = elements.filter(el => {
                const h = el.height ?? el.properties?.height ?? el.dimensions?.height ?? 0;
                return Number(h) >= minHeight;
            });
        }
        const ids = elements.map(el => String(el.id));
        if (action === 'hide') {
            applyCategoryTypeVisibility(bag, value, subType, false);
        } else if (action === 'isolate') {
            applyIsolate(bag, `cat-type:${value}:${subType}`, () => ids);
        } else if (action === 'highlight') {
            selectElements(ids);
        }

    } else if (target === 'all') {
        if (action === 'hide' && scene) {
            scene.traverse((obj: any) => {
                if (obj.userData?.id && obj.userData?.role !== 'edges') obj.visible = false;
            });
        } else if (action === 'highlight') {
            selectElements(getAllElementIds(bag));
        }
    }

    bag.refresh();
}
