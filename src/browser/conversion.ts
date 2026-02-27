import type {
  BomExport,
  InputFormat,
  NameFormat,
  NodeMap,
  ReadOptions,
  TriangulateOptions,
} from '../core/types';
import type { OcctDocumentHandle } from '../core/document';
import {
  TRIANGLE_EXPLOSION_THRESHOLDS,
  getTriangulationForAttempt,
  isTriangleExplosion,
} from '../core/triangulation-policy';
import { summarizeGlbGeometry, type GlbGeometryStats } from '../core/glb-geometry';
import { buildAssemblyTree } from '../core/assembly';
import { buildGltfNodeIndexByOcafEntry } from '../core/gltf-mapping';
import { buildPrettyNameOverridesFromGlb } from '../core/gltf-mapping';
import { computeBoundsMeters } from '../core/glb-geometry';
import { readInputUnitScaleToMeters, unitNameFromScale } from '../core/unit-scale';
import { injectAssetExtrasIntoGlb } from '../core/glb-metadata';
import type { OpenCascadeConverter } from './converter';

export type ConversionWarning = {
  code: string;
  message: string;
  detail?: Record<string, unknown>;
};

export type GlbConversionOptions = {
  triangulate?: TriangulateOptions;
  nameFormat?: NameFormat;
  attempts?: number;
  unitScaleToMeters?: number;
  triangleExplosionThresholds?: typeof TRIANGLE_EXPLOSION_THRESHOLDS;
};

export type GlbConversionResult = {
  glb: Uint8Array;
  meshStats: GlbGeometryStats;
  triangulateUsed: TriangulateOptions;
  conversionWarnings: ConversionWarning[];
};

export type ConvertedNode = {
  id: string;
  name: string;
  productId: string;
  parentId?: string;
  childrenIds: string[];
  gltfNodeIndex: number;
  gltfMeshIndex?: number;
};

export type MappedNodeMap = {
  roots: string[];
  nodes: Record<string, ConvertedNode>;
};

export type BomSummaryItem = {
  name: string;
  quantity: number;
  productId?: string;
  kind?: string;
};

export type ConversionMetadata = {
  schemaVersion?: string;
  meshStats: GlbGeometryStats;
  conversionWarnings: ConversionWarning[];
  assemblyTree: ReturnType<typeof buildAssemblyTree>;
  nodeMap: MappedNodeMap;
  bom: BomSummaryItem[];
  units: {
    inputLengthUnit: string;
    inputUnitSource: string;
    outputLengthUnit: 'm';
    scaleToMeters: number;
  };
  boundsMeters: { min: [number, number, number]; max: [number, number, number] };
};

export type ConvertCadBufferOptions = {
  inputFormat: InputFormat;
  triangulate?: TriangulateOptions;
  nameFormat?: NameFormat;
  readOptions?: ReadOptions;
  attempts?: number;
  unitScaleToMeters?: number;
  schemaVersion?: string;
  embedMetadataKey?: string;
  validateNodeMap?: boolean;
  validateMesh?: boolean;
};

export type ConvertCadBufferResult = {
  glb: Uint8Array;
  patchedGlb?: Uint8Array;
  meshStats: GlbGeometryStats;
  conversionWarnings: ConversionWarning[];
  metadata: ConversionMetadata;
};

export function convertDocumentToGlbWithRetries(
  converter: OpenCascadeConverter,
  docHandle: OcctDocumentHandle,
  options: GlbConversionOptions = {}
): GlbConversionResult {
  const conversionWarnings: ConversionWarning[] = [];
  const triangulateOriginal = options.triangulate ?? {};

  if (triangulateOriginal.relative === true) {
    conversionWarnings.push({
      code: 'mesh/relative-forced-false',
      message: 'Relative deflection was disabled to ensure absolute tessellation.',
      detail: {
        triangulateOriginal,
        triangulateForced: {
          ...triangulateOriginal,
          relative: false,
        },
      },
    });
  }

  const linearDeflection0 = triangulateOriginal.linearDeflection ?? 1;
  const angularDeflection0 = triangulateOriginal.angularDeflection ?? 0.5;
  const attempts = Math.max(1, options.attempts ?? 3);
  const thresholds =
    options.triangleExplosionThresholds ?? TRIANGLE_EXPLOSION_THRESHOLDS;

  let glb: Uint8Array | null = null;
  let meshStats: GlbGeometryStats | null = null;
  let triangulateUsed: TriangulateOptions | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    triangulateUsed = getTriangulationForAttempt(
      {
        linearDeflection0,
        angularDeflection0,
        parallel: triangulateOriginal.parallel,
      },
      attempt
    );

    converter.triangulate(docHandle.get(), triangulateUsed);
    const result = converter.writeBuffer(docHandle, 'glb', {
      nameFormat: options.nameFormat ?? 'productAndInstanceAndOcaf',
      unitScaleToMeters: options.unitScaleToMeters,
    });

    if (result.outputFormat !== 'glb') {
      throw new Error('Failed to generate GLB output.');
    }

    glb = result.glb;
    meshStats = summarizeGlbGeometry(glb);

    if (!isTriangleExplosion(meshStats, thresholds)) {
      break;
    }

    const detail = {
      attempt,
      thresholds,
      meshStats,
      triangulateUsed,
    };

    if (attempt < attempts - 1) {
      conversionWarnings.push({
        code: 'mesh/triangle-explosion-retry',
        message: `Triangle explosion detected on attempt ${attempt}; meshing was coarsened and retried.`,
        detail,
      });
      continue;
    }

    conversionWarnings.push({
      code: 'mesh/triangle-explosion-unresolved',
      message:
        'Triangle explosion thresholds were exceeded after the final attempt.',
      detail,
    });
  }

  if (!glb || !meshStats || !triangulateUsed) {
    throw new Error('Failed to generate GLB output.');
  }

  return { glb, meshStats, triangulateUsed, conversionWarnings };
}

function buildMappedNodeMap(
  nodeMapRaw: NodeMap,
  glb: Uint8Array
): MappedNodeMap {
  const gltfNodeIndexByEntry = buildGltfNodeIndexByOcafEntry(glb);
  const prettyNamesByEntry = buildPrettyNameOverridesFromGlb(glb);

  const usedGltfNodeIndices = new Set<number>();
  const nodes: Record<string, ConvertedNode> = {};

  for (const [nodeId, node] of Object.entries(
    nodeMapRaw.nodes as Record<string, any>
  )) {
    const mapping =
      typeof node.labelEntry === 'string'
        ? gltfNodeIndexByEntry.get(node.labelEntry)
        : undefined;
    if (!mapping) {
      throw new Error(`Missing glTF mapping for node ${nodeId}`);
    }
    if (usedGltfNodeIndices.has(mapping.gltfNodeIndex)) {
      throw new Error(
        `Duplicate glTF node mapping for index ${mapping.gltfNodeIndex}`
      );
    }
    usedGltfNodeIndices.add(mapping.gltfNodeIndex);

    nodes[nodeId] = {
      id: node.id,
      name:
        (typeof node.labelEntry === 'string'
          ? prettyNamesByEntry.get(node.labelEntry)
          : undefined) || node.name,
      productId: node.productId,
      parentId: node.parentId ?? undefined,
      childrenIds: Array.isArray(node.children) ? node.children : [],
      gltfNodeIndex: mapping.gltfNodeIndex,
      gltfMeshIndex: mapping.gltfMeshIndex,
    };
  }

  return { roots: nodeMapRaw.roots, nodes };
}

function buildBomSummary(
  bomRaw: BomExport,
  mappedNodeMap: MappedNodeMap
): BomSummaryItem[] {
  const prettyNameByProductId = new Map<string, string>();
  Object.values(mappedNodeMap.nodes).forEach((node) => {
    if (
      node &&
      typeof node.productId === 'string' &&
      node.productId.length > 0 &&
      typeof node.name === 'string' &&
      node.name.length > 0 &&
      !prettyNameByProductId.has(node.productId)
    ) {
      prettyNameByProductId.set(node.productId, node.name);
    }
  });

  if (!Array.isArray((bomRaw as any)?.items)) {
    return [];
  }

  return (bomRaw as any).items.map((item: any) => ({
    name:
      (typeof item.productId === 'string'
        ? prettyNameByProductId.get(item.productId)
        : undefined) ||
      item.productName ||
      item.productId ||
      'Unknown',
    quantity: item.quantity ?? 0,
    productId: item.productId,
    kind: item.kind,
  }));
}

export function convertCadBufferToGlbWithMetadata(
  converter: OpenCascadeConverter,
  input: Uint8Array,
  options: ConvertCadBufferOptions
): ConvertCadBufferResult {
  const docHandle = converter.readBuffer(
    input,
    options.inputFormat,
    options.readOptions ?? {
      preserveNames: true,
      preserveColors: true,
      preserveLayers: true,
      preserveMaterials: true,
    }
  );

  const nodeMapRaw = converter.createNodeMap(docHandle) as NodeMap;
  if (options.validateNodeMap) {
    const rootCount = Array.isArray(nodeMapRaw?.roots)
      ? nodeMapRaw.roots.length
      : 0;
    const nodeCount = nodeMapRaw?.nodes
      ? Object.keys(nodeMapRaw.nodes as Record<string, unknown>).length
      : 0;
    if (rootCount === 0 || nodeCount === 0) {
      throw Object.assign(
        new Error('This STEP file contains no supported solids/assemblies.'),
        {
          __code: 'UNSUPPORTED_STEP_CONTENT',
          detail: { rootCount, nodeCount },
        }
      );
    }
  }

  const oc = (converter as any).oc;
  const unitInfo = Number.isFinite(options.unitScaleToMeters)
    ? { scaleToMeters: options.unitScaleToMeters as number, source: 'override' }
    : readInputUnitScaleToMeters(oc, docHandle);

  const { glb, meshStats, conversionWarnings } =
    convertDocumentToGlbWithRetries(converter, docHandle, {
      triangulate: options.triangulate,
      nameFormat: options.nameFormat,
      attempts: options.attempts,
      unitScaleToMeters: unitInfo.scaleToMeters,
    });

  if (options.validateMesh) {
    if (meshStats.meshCount === 0 || meshStats.primitivesWithPositionCount === 0) {
      throw Object.assign(
        new Error('This STEP file contains no supported solids/assemblies.'),
        {
          __code: 'UNSUPPORTED_STEP_CONTENT',
          detail: meshStats,
        }
      );
    }
  }

  const mappedNodeMap = buildMappedNodeMap(nodeMapRaw, glb);
  const bomRaw = converter.createBom(docHandle) as BomExport;
  const boundsMeters = computeBoundsMeters(glb);

  const metadata: ConversionMetadata = {
    ...(options.schemaVersion ? { schemaVersion: options.schemaVersion } : {}),
    meshStats,
    conversionWarnings,
    assemblyTree: buildAssemblyTree(mappedNodeMap),
    nodeMap: mappedNodeMap,
    bom: buildBomSummary(bomRaw, mappedNodeMap),
    units: {
      inputLengthUnit: unitNameFromScale(unitInfo.scaleToMeters),
      inputUnitSource: unitInfo.source,
      outputLengthUnit: 'm',
      scaleToMeters: unitInfo.scaleToMeters,
    },
    boundsMeters,
  };

  let patchedGlb: Uint8Array | undefined;
  if (options.embedMetadataKey) {
    patchedGlb = injectAssetExtrasIntoGlb(glb, {
      [options.embedMetadataKey]: metadata,
    });
  }

  return { glb, patchedGlb, meshStats, conversionWarnings, metadata };
}
