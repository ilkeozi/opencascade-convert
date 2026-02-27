/**
 * Loads OpenCascade (WASM) and returns a browser converter.
 */
export { createConverter } from './converter';
export {
  /**
   * Converts a CAD buffer to GLB with metadata assembly.
   */
  convertCadBufferToGlbWithMetadata,
  /**
   * Converts an OCCT document to GLB with retry-based triangulation.
   */
  convertDocumentToGlbWithRetries,
  type ConversionWarning,
  type ConvertCadBufferOptions,
  type ConvertCadBufferResult,
  type GlbConversionOptions,
  type GlbConversionResult,
} from './conversion';

/**
 * Triangulation retry thresholds and helpers.
 */
export {
  TRIANGLE_EXPLOSION_THRESHOLDS,
  getTriangulationForAttempt,
  isTriangleExplosion,
} from '../core/triangulation-policy';
/**
 * GLB geometry utilities.
 */
export {
  computeBoundsMeters,
  maxDimension,
  summarizeGlbGeometry,
  type GlbBounds,
  type GlbGeometryStats,
} from '../core/glb-geometry';
/**
 * glTF node mapping helpers.
 */
export {
  buildGltfNodeIndexByOcafEntry,
  buildPrettyNameOverridesFromGlb,
  type GltfNodeIndex,
} from '../core/gltf-mapping';
/**
 * Unit conversion helpers.
 */
export {
  applyLengthUnitConversionToWriter,
  readInputUnitScaleToMeters,
  unitNameFromScale,
} from '../core/unit-scale';
/**
 * Assembly tree helper.
 */
export { buildAssemblyTree } from '../core/assembly';
/**
 * GLB asset extras injection helper.
 */
export { injectAssetExtrasIntoGlb } from '../core/glb-metadata';
/**
 * Error types.
 */
export { ConversionError, ValidationError } from '../core/errors';

/**
 * Public types.
 */
export type {
  BomExport,
  BomItem,
  BomOccurrence,
  ConvertBufferResult,
  InputFormat,
  NodeMap,
  OutputFormat,
} from '../core/types';
