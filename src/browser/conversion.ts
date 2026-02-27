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

/**
 * Warning emitted during conversion.
 * @property code Stable warning identifier.
 * @property message Human-readable description.
 * @property detail Optional machine-readable context.
 */
export type ConversionWarning = {
  /**
   * Stable warning identifier (machine-readable).
   */
  code: string;
  /**
   * Human-readable description of the condition.
   */
  message: string;
  /**
   * Additional structured data for diagnostics.
   */
  detail?: Record<string, unknown>;
};

/**
 * Options for a GLB conversion attempt with retries.
 */
export type GlbConversionOptions = {
  /**
   * Triangulation parameters applied per attempt.
   * `relative` will be forced to false.
   */
  triangulate?: TriangulateOptions;
  /**
   * glTF name format used during export.
   */
  nameFormat?: NameFormat;
  /**
   * Number of triangulation attempts to perform (min 1).
   */
  attempts?: number;
  /**
   * Override input unit scale in meters (skips document unit detection).
   */
  unitScaleToMeters?: number;
  /**
   * Override triangle explosion detection thresholds.
   */
  triangleExplosionThresholds?: typeof TRIANGLE_EXPLOSION_THRESHOLDS;
};

/**
 * Result from a GLB conversion attempt.
 */
export type GlbConversionResult = {
  /**
   * GLB output buffer.
   */
  glb: Uint8Array;
  /**
   * Mesh statistics derived from the GLB.
   */
  meshStats: GlbGeometryStats;
  /**
   * Triangulation parameters that produced the final result.
   */
  triangulateUsed: TriangulateOptions;
  /**
   * Warnings encountered during conversion.
   */
  conversionWarnings: ConversionWarning[];
};

export type ConvertedNode = {
  /**
   * Stable node identifier (path-based).
   */
  id: string;
  /**
   * Display name (pretty name if available).
   */
  name: string;
  /**
   * Product identifier shared across instances.
   */
  productId: string;
  /**
   * Parent node identifier, if any.
   */
  parentId?: string;
  /**
   * Child node identifiers.
   */
  childrenIds: string[];
  /**
   * Index of the mapped glTF node.
   */
  gltfNodeIndex: number;
  /**
   * Index of the mapped glTF mesh, if any.
   */
  gltfMeshIndex?: number;
};

/**
 * Node map after resolving glTF indices.
 */
export type MappedNodeMap = {
  /**
   * Root node identifiers.
   */
  roots: string[];
  /**
   * Nodes keyed by stable node id.
   */
  nodes: Record<string, ConvertedNode>;
};

/**
 * BOM summary item derived from BOM + node map.
 */
export type BomSummaryItem = {
  /**
   * Display name (pretty name, product name, or fallback).
   */
  name: string;
  /**
   * Number of occurrences for this product.
   */
  quantity: number;
  /**
   * Product identifier, when available.
   */
  productId?: string;
  /**
   * Product kind (e.g. part or assembly) when available.
   */
  kind?: string;
};

/**
 * Metadata produced alongside GLB output.
 * Contains mesh stats, BOM, node map, units, bounds, and warnings.
 * `schemaVersion` is optional; `units.outputLengthUnit` is always `'m'`.
 */
export type ConversionMetadata = {
  /**
   * Optional schema/version tag for downstream consumers.
   */
  schemaVersion?: string;
  /**
   * Mesh statistics derived from the GLB.
   */
  meshStats: GlbGeometryStats;
  /**
   * Warnings emitted during conversion.
   */
  conversionWarnings: ConversionWarning[];
  /**
   * Assembly tree derived from the mapped node map.
   */
  assemblyTree: ReturnType<typeof buildAssemblyTree>;
  /**
   * Node map with glTF indices resolved.
   */
  nodeMap: MappedNodeMap;
  /**
   * BOM summary derived from the BOM and node map.
   */
  bom: BomSummaryItem[];
  /**
   * Unit metadata for input and output lengths.
   */
  units: {
    /**
     * Input unit name inferred from the document or override.
     */
    inputLengthUnit: string;
    /**
     * Source for unit inference (e.g. override or OCCT source).
     */
    inputUnitSource: string;
    /**
     * Output unit; always meters.
     */
    outputLengthUnit: 'm';
    /**
     * Scale factor to meters applied during export.
     */
    scaleToMeters: number;
  };
  /**
   * Axis-aligned bounds in meters.
   */
  boundsMeters: { min: [number, number, number]; max: [number, number, number] };
};

/**
 * CAD buffer conversion options.
 */
export type ConvertCadBufferOptions = {
  /**
   * Input format ('step' or 'iges').
   */
  inputFormat: InputFormat;
  /**
   * Triangulation parameters applied per attempt.
   * `relative` will be forced to false.
   */
  triangulate?: TriangulateOptions;
  /**
   * glTF name format used during export.
   */
  nameFormat?: NameFormat;
  /**
   * Reader options applied during import.
   */
  readOptions?: ReadOptions;
  /**
   * Number of triangulation attempts to perform (min 1).
   */
  attempts?: number;
  /**
   * Override input unit scale in meters (skips document unit detection).
   */
  unitScaleToMeters?: number;
  /**
   * Optional schema version attached to metadata output.
   */
  schemaVersion?: string;
  /**
   * Embed metadata into the GLB asset extras under this key.
   */
  embedMetadataKey?: string;
  /**
   * Throw when node map is empty.
   */
  validateNodeMap?: boolean;
  /**
   * Throw when mesh statistics indicate empty geometry.
   */
  validateMesh?: boolean;
};

/**
 * Result from CAD buffer conversion with metadata.
 */
export type ConvertCadBufferResult = {
  /**
   * GLB output buffer.
   */
  glb: Uint8Array;
  /**
   * GLB output with embedded metadata extras, when requested.
   */
  patchedGlb?: Uint8Array;
  /**
   * Mesh statistics derived from the GLB.
   */
  meshStats: GlbGeometryStats;
  /**
   * Warnings emitted during conversion.
   */
  conversionWarnings: ConversionWarning[];
  /**
   * Structured metadata extracted from the CAD document and GLB.
   */
  metadata: ConversionMetadata;
};

/**
 * Converts an OCCT document to GLB with retry-based triangulation.
 * @param converter Converter instance.
 * @param docHandle XCAF document handle.
 * @param options Conversion options.
 * @returns GLB data, mesh stats, triangulation used, and warnings.
 * @throws Error when GLB output is not produced.
 */
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

/**
 * Converts a CAD buffer to GLB and assembles metadata outputs.
 * @param converter Converter instance.
 * @param input Raw file bytes.
 * @param options Conversion + metadata options.
 * @returns GLB buffer, optional patched GLB, mesh stats, warnings, metadata.
 * @throws Error when validation fails or glTF mapping cannot be built.
 */
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
