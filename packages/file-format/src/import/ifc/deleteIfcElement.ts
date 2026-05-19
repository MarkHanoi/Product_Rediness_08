import * as THREE from '@pryzm/renderer-three/three';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();


export interface DeleteIfcImportedElementOptions {
    confirmFn?: (opts: { title: string; elementName: string; message: string }) => Promise<boolean>;
    confirm?: boolean;
    selectionManager?: {
        unselectAll?: () => void;
        deselect?: () => void;
    } | null;
    updateShadows?: () => void | Promise<void>;
}

export function isIfcImportedElement(obj: THREE.Object3D | null | undefined): obj is THREE.Object3D {
    return obj?.userData?.source === 'ifc-import' && obj.userData?.expressID != null;
}

export async function deleteIfcImportedElement(
    obj: THREE.Object3D | null | undefined,
    options: DeleteIfcImportedElementOptions = {},
): Promise<boolean> {
    if (!isIfcImportedElement(obj)) return false;

    const ud = obj.userData;
    const elementId = ud.id ?? `ifc-${ud.expressID}`;
    const modelId = ud.modelId ?? '';
    const elementName = ud.name ?? `Element ${ud.expressID}`;

    if (options.confirm !== false) {
        const ok = await (options.confirmFn ?? (() => Promise.resolve(true)))({
            title: 'Delete Imported Element',
            elementName,
            message: 'The selected IFC element will be permanently removed from this view.',
        });
        if (!ok) return false;
    }

    obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
        if (geometry?.dispose) geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) {
            material.forEach((m) => m?.dispose?.());
        } else {
            material?.dispose?.();
        }
    });

    obj.removeFromParent();

    const store: any = window.ifcModelStore; // TODO(TASK-08)
    if (store?.removeElement) store.removeElement(modelId, elementId);

    const sm = options.selectionManager ?? window.selectionManager;
    if (sm?.unselectAll) sm.unselectAll();
    else if (sm?.deselect) sm.deselect();

    try {
        void Promise.resolve(options.updateShadows?.());
    } catch (err) {
        console.warn('[IFC Delete] Shadow update failed:', err);
    }

    _bus.emit('pryzm-ifc-element-removed', { modelId, elementId, expressID: ud.expressID }); // F.events.18
    _bus.emit('pryzm-ifc-tree-updated', {}); // F.events.18
    window.dispatchEvent(new CustomEvent('bim-selection-changed', { detail: { object: null, deletedId: elementId } })); // keep DOM for plugins
    (window as any).runtime?.events?.emit('bim-selection-changed', { object: null, deletedId: elementId }); // F.events.16 bridge

    return true;
}