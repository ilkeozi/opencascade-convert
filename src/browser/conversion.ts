import type { NameFormat, TriangulateOptions } from '../core/types';
import type { OcctDocumentHandle } from '../core/document';
import {
  TRIANGLE_EXPLOSION_THRESHOLDS,
  getTriangulationForAttempt,
  isTriangleExplosion,
} from '../core/triangulation-policy';
import { summarizeGlbGeometry, type GlbGeometryStats } from '../core/glb-geometry';
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
