import { IfcConversionCandidate, IfcNativeCategory, IfcSourceTrace } from './IfcConversionTypes';
import { normaliseIfcType } from './IfcConversionContext';
import * as THREE from '@pryzm/renderer-three/three';

export class IfcClassifier {
  classify(mesh: THREE.Mesh, trace: IfcSourceTrace): IfcNativeCategory {
    const raw = normaliseIfcType(trace.rawIfcType || trace.ifcTypeName || mesh.userData?.type);
    const type = normaliseIfcType(mesh.userData?.type);
    const predefined = this.extractPredefinedType(trace.psets);

    if (raw.includes('IFCSPACE') || type === 'IFCSPACE' || type === 'SPACE') return 'room';

    if (raw.includes('IFCWALLSTANDARDCASE') || raw === 'IFCWALLSTANDARDCASE') return 'wall';
    if (raw.includes('IFCCURTAINWALL') || type.includes('CURTAINWALL') || type === 'CURTAIN-WALL') return 'curtainwall';
    if (raw.includes('IFCWALL') || type.includes('WALL')) return 'wall';

    // BUG-FIX: IFCSLAB with PredefinedType=ROOF must be routed to the roof
    // converter, not the generic slab path.  Revit exports roof slabs this way.
    if (raw.includes('IFCSLAB') || type.includes('SLAB')) {
      if (predefined === 'ROOF') return 'roof';
      if (predefined === 'BASESLAB' || predefined === 'LANDING' || predefined === 'RAMP') return 'floor';
      return 'slab';
    }

    if (raw.includes('IFCCOVERING') && predefined === 'FLOORING') return 'floor';
    if (raw.includes('IFCCOVERING') && predefined === 'CEILING') return 'ceiling';
    if (raw.includes('IFCCOVERING') && (predefined === 'CLADDING' || predefined === 'INSULATION')) return 'native-proxy';
    if (raw.includes('IFCCOVERING')) return 'native-proxy';

    if (type.includes('FLOOR')) return 'floor';
    if (type.includes('CEILING')) return 'ceiling';

    if (raw.includes('IFCCOLUMN') || type.includes('COLUMN')) return 'column';

    if (raw.includes('IFCBEAM') || type.includes('BEAM')) return 'beam';
    if (raw.includes('IFCMEMBER') || type.includes('MEMBER')) return this.classifyMember(predefined);
    if (raw.includes('IFCPLATE') || type.includes('PLATE')) return 'native-proxy';

    if (raw.includes('IFCDOOR') || type.includes('DOOR')) return 'door';
    if (raw.includes('IFCWINDOW') || type.includes('WINDOW')) return 'window';

    if (raw.includes('IFCROOF') || type.includes('ROOF')) return 'roof';

    if (raw.includes('IFCRAILING') || type.includes('RAILING') || type === 'HANDRAIL') return 'railing';

    if (
      raw.includes('IFCFURNISHINGELEMENT') ||
      raw.includes('IFCFURNITURE') ||
      raw.includes('IFCSANITARYTERMINAL') ||
      raw.includes('IFCFLOWTERMINAL') ||
      type.includes('FURNITURE') ||
      type.includes('FURNISHING')
    ) return 'furniture';

    if (
      raw.includes('IFCSTAIRFLIGHT') ||
      raw.includes('IFCSTAIR') ||
      type.includes('STAIR')
    ) return 'stair';

    return 'native-proxy';
  }

  private classifyMember(predefined: string | undefined): IfcNativeCategory {
    if (!predefined) return 'beam';
    if (predefined.includes('MULLION') || predefined.includes('TRANSOM') || predefined.includes('RAIL')) return 'native-proxy';
    if (predefined.includes('COLUMN') || predefined.includes('POST')) return 'column';
    return 'beam';
  }

  toCandidate(mesh: THREE.Mesh): IfcConversionCandidate {
    const ud = mesh.userData ?? {};
    const trace: IfcSourceTrace = {
      modelId: ud.modelId ?? this.findModelId(mesh),
      modelName: ud.modelName,
      expressID: Number(ud.expressID),
      ifcTypeName: ud.ifcTypeName ?? ud.type,
      rawIfcType: ud.rawIfcType ?? ud.ifcTypeName ?? ud.type,
      globalId: ud.globalId ?? ud.guid,
      storeyName: ud.storeyName,
      sourceMeshName: mesh.name,
      psets: ud.psets,
    };

    return {
      sourceId: ud.id ?? `ifc-${trace.expressID}`,
      category: this.classify(mesh, trace),
      mesh,
      trace,
    };
  }

  private extractPredefinedType(psets: Record<string, any> | undefined): string | undefined {
    if (!psets) return undefined;
    for (const value of Object.values(psets)) {
      if (value && typeof value === 'object') {
        const direct = (value as any).PredefinedType ?? (value as any).predefinedType;
        if (direct) return normaliseIfcType(direct);
      }
    }
    return undefined;
  }

  private findModelId(mesh: THREE.Object3D): string {
    let current: THREE.Object3D | null = mesh;
    while (current) {
      if (current.userData?.modelId) return current.userData.modelId;
      current = current.parent;
    }
    return 'ifc-model';
  }
}
