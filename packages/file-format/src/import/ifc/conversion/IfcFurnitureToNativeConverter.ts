import { CreateFurnitureCommand } from '@pryzm/command-registry';
import { executeHumanDirect, makeUuid } from './IfcConversionContext';
import { IfcConversionCandidate, IfcConversionIssue, RectangleAnalysis } from './IfcConversionTypes';
import type { FurnitureType, FurnitureMaterial } from '@pryzm/geometry-furniture';

// §27 §3.1 — Order matters: more specific patterns first so e.g. "dining chair"
// resolves to dining_chair before the generic "chair" rule fires, and
// "coffee table" / "bedside table" / "dining table" win over generic "table".
const IFC_NAME_TO_FURNITURE_TYPE: Array<[RegExp, FurnitureType]> = [
  // Specific bed variants
  [/japanese.*platform.*bed|platform.*bed/i, 'japanese_platform_bed'],
  [/japanese.*float.*bed|float.*bed/i, 'japanese_float_bed'],
  [/japanese.*walnut.*bed|walnut.*bed/i, 'japanese_walnut_bed'],
  [/nordic.*bed|scandinavian.*bed/i, 'nordic_bed'],
  [/solid.*wood.*bed|midcentury.*bed|mid.century.*bed/i, 'solid_wood_bed'],
  [/bed(?!side)/i, 'bed'],
  [/bedside|nightstand|night\s*table/i, 'bedside_table'],

  // Specific table variants
  [/coffee\s*table/i, 'coffee_table'],
  [/dining\s*table/i, 'dining_table'],
  [/entrance\s*table|console\s*table|hall\s*table/i, 'entrance_table'],
  [/table|desk/i, 'table'],

  // Chairs
  [/dining\s*chair/i, 'dining_chair'],
  [/chair|seat|stool/i, 'chair'],

  // Sofas — specific seat-count variants before generic fallback.
  [/1[- ]?seat.*sofa|single[- ]seat.*sofa|one[- ]seat.*sofa/i, 'white_sofa_1seat'],
  [/2[- ]?seat.*sofa|two[- ]seat.*sofa|double[- ]seat.*sofa/i, 'white_sofa_2seat'],
  [/3[- ]?seat.*sofa|three[- ]seat.*sofa|triple[- ]seat.*sofa/i, 'white_sofa_3seat'],
  [/sofa|couch|settee|sectional/i, 'corner_sofa'],

  // Wardrobes / closets — recognise corner and parametric layouts when named
  [/corner\s*wardrobe/i, 'corner_wardrobe'],
  [/wardrobe.*l[- ]?shape|l[- ]?shape.*wardrobe/i, 'wardrobe_l_shape'],
  [/wardrobe.*u[- ]?shape|u[- ]?shape.*wardrobe/i, 'wardrobe_u_shape'],
  [/wardrobe|closet|armoire/i, 'wardrobe'],

  // Kitchen cabinet runs (more specific patterns first)
  [/kitchen.*island|island.*kitchen/i, 'kitchen_island'],
  [/kitchen.*l[- ]?shape.*(?:tall|upper|wall)|(?:tall|upper|wall).*kitchen.*l[- ]?shape/i, 'kitchen_l_shape_tall'],
  [/kitchen.*u[- ]?shape.*(?:tall|upper|wall)|(?:tall|upper|wall).*kitchen.*u[- ]?shape/i, 'kitchen_u_shape_tall'],
  [/kitchen.*straight.*(?:tall|upper|wall)|(?:tall|upper|wall).*kitchen.*straight/i, 'kitchen_straight_tall'],
  [/kitchen.*l[- ]?shape|l[- ]?shape.*kitchen/i, 'kitchen_l_shape'],
  [/kitchen.*u[- ]?shape|u[- ]?shape.*kitchen/i, 'kitchen_u_shape'],
  [/kitchen|cabinetry|cabinet\s*run/i, 'kitchen_straight'],

  // Misc fixtures
  [/lamp|light|luminaire/i, 'lamp'],
  [/toilet|wc|water\s*closet/i, 'toilet_radiator'],
  [/chimney|fireplace/i, 'chimney'],
  [/shower(?:.*panel)?/i, 'shower_glass_panel'],
  [/plant|planter|vegetation/i, 'plant_01'],
];

export class IfcFurnitureToNativeConverter {
  constructor(private commandManager: any, private issues: IfcConversionIssue[]) {}

  convert(candidate: IfcConversionCandidate, analysis: RectangleAnalysis, dryRun: boolean): string | undefined {
    if (!candidate.levelId) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: 'Furniture conversion skipped: no native level resolved.' });
      return undefined;
    }

    const id = makeUuid('furniture-ifc');
    if (dryRun) return id;

    const psets = candidate.trace.psets ?? {};
    const name = candidate.trace.sourceMeshName ?? candidate.trace.ifcTypeName ?? '';
    const furnitureType = this.resolveFurnitureType(name, psets);
    const { width, length, height } = this.resolveDimensions(psets, analysis);
    const material = this.resolveMaterial(psets);

    const result = executeHumanDirect(this.commandManager, new CreateFurnitureCommand({
      id,
      furnitureType,
      position: { x: analysis.center.x, y: analysis.minY, z: analysis.center.z },
      rotation: { x: 0, y: 0, z: 0 },
      levelId: candidate.levelId,
      baseOffset: 0,
      width,
      length,
      height,
      material,
      metadata: {
        ifcSourceId: candidate.sourceId,
        ifcName: name,
        rawIfcType: candidate.trace.rawIfcType,
      },
    }));

    if (!result?.success) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: `Furniture command failed: ${result?.error ?? result?.info?.join(', ') ?? 'unknown error'}` });
      return undefined;
    }
    return id;
  }

  private resolveFurnitureType(name: string, psets: Record<string, any>): FurnitureType {
    const objectType = String(psets['Pset_FurnishingElementCommon']?.ObjectType ?? psets['Pset_ManufacturerTypeInformation']?.ProductCode ?? '');
    const searchStr = `${name} ${objectType}`;
    for (const [pattern, type] of IFC_NAME_TO_FURNITURE_TYPE) {
      if (pattern.test(searchStr)) return type;
    }
    return 'chair';
  }

  private resolveDimensions(psets: Record<string, any>, analysis: RectangleAnalysis): { width: number; length: number; height: number } {
    const qto = psets['Qto_FurnitureBaseQuantities'] ?? psets['Qto_FurnishingElementBaseQuantities'] ?? {};
    const w = Number(qto['Width'] ?? qto['width'] ?? 0);
    const l = Number(qto['Length'] ?? qto['length'] ?? qto['Depth'] ?? qto['depth'] ?? 0);
    const h = Number(qto['Height'] ?? qto['height'] ?? 0);
    return {
      width: w > 0.05 ? w : Math.max(0.1, analysis.width),
      length: l > 0.05 ? l : Math.max(0.1, analysis.depth),
      height: h > 0.05 ? h : Math.max(0.1, analysis.height),
    };
  }

  private resolveMaterial(psets: Record<string, any>): FurnitureMaterial {
    const materialLabel = String(
      psets['Pset_FurnishingElementCommon']?.Material ??
      psets['Pset_ManufacturerTypeInformation']?.Material ??
      ''
    ).toLowerCase();
    if (materialLabel.includes('wood') || materialLabel.includes('timber')) return 'wood';
    if (materialLabel.includes('metal') || materialLabel.includes('steel') || materialLabel.includes('aluminium')) return 'metal';
    if (materialLabel.includes('glass')) return 'glass';
    if (materialLabel.includes('fabric') || materialLabel.includes('textile') || materialLabel.includes('upholster')) return 'fabric';
    return 'wood';
  }
}
