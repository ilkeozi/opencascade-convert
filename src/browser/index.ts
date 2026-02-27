export { createConverter } from './converter';
export {
  convertCadBufferToGlbWithMetadata,
  convertDocumentToGlbWithRetries,
  type ConversionWarning,
  type ConvertCadBufferOptions,
  type ConvertCadBufferResult,
  type GlbConversionOptions,
  type GlbConversionResult,
} from './conversion';

export {
  TRIANGLE_EXPLOSION_THRESHOLDS,
  getTriangulationForAttempt,
  isTriangleExplosion,
} from '../core/triangulation-policy';
export {
  computeBoundsMeters,
  maxDimension,
  summarizeGlbGeometry,
  type GlbBounds,
  type GlbGeometryStats,
} from '../core/glb-geometry';
export {
  buildGltfNodeIndexByOcafEntry,
  buildPrettyNameOverridesFromGlb,
  type GltfNodeIndex,
} from '../core/gltf-mapping';
export {
  applyLengthUnitConversionToWriter,
  readInputUnitScaleToMeters,
  unitNameFromScale,
} from '../core/unit-scale';
export { buildAssemblyTree } from '../core/assembly';
export { injectAssetExtrasIntoGlb } from '../core/glb-metadata';
export { ConversionError, ValidationError } from '../core/errors';

export type {
  BomExport,
  BomItem,
  BomOccurrence,
  ConvertBufferResult,
  InputFormat,
  NodeMap,
  OutputFormat,
} from '../core/types';
