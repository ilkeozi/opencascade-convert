import type { TriangulateOptions } from './types';

/**
 * Hard limits used to flag mesh "triangle explosion".
 * Units: absolute counts.
 */
/**
 * Default "triangle explosion" limits.
 * Tuned to catch runaway tessellation while allowing large assemblies.
 */
export const TRIANGLE_EXPLOSION_THRESHOLDS = {
  MAX_TRIANGLES: 5_000_000, // Upper bound for total triangle count.
  MAX_PRIMITIVES: 50_000, // Upper bound for primitive count across meshes.
} as const;

export type MeshStatsLike = {
  triangles: number;
  primitiveCount: number;
};

/**
 * Returns true when mesh statistics exceed the configured thresholds.
 * @param meshStats Measured triangle and primitive counts.
 * @param thresholds Limits to compare against.
 */
export function isTriangleExplosion(
  meshStats: MeshStatsLike,
  thresholds: typeof TRIANGLE_EXPLOSION_THRESHOLDS = TRIANGLE_EXPLOSION_THRESHOLDS
) {
  return (
    meshStats.triangles > thresholds.MAX_TRIANGLES ||
    meshStats.primitiveCount > thresholds.MAX_PRIMITIVES
  );
}

export type TriangulationAttemptInput = {
  linearDeflection0: number;
  angularDeflection0: number;
  parallel?: boolean;
};

export type TriangulationAttempt = {
  linearDeflection: number;
  angularDeflection: number;
  relative: false;
  parallel?: boolean;
};

/**
 * Computes the triangulation parameters for a given attempt index.
 * @param input Base deflection inputs.
 * @param attemptIndex 0=baseline, 1=coarser, >=2=coarsest.
 * @returns Triangulation options with relative forced to false.
 */
export function getTriangulationForAttempt(
  input: TriangulationAttemptInput,
  attemptIndex: number
): TriangulationAttempt & TriangulateOptions {
  if (attemptIndex <= 0) {
    return {
      linearDeflection: input.linearDeflection0,
      angularDeflection: input.angularDeflection0,
      relative: false,
      parallel: input.parallel,
    };
  }

  if (attemptIndex === 1) {
    return {
      // Coarsen by 2x on attempt 1; cap angular deflection at 1.0 rad.
      linearDeflection: input.linearDeflection0 * 2,
      angularDeflection: Math.min(1.0, input.angularDeflection0 * 1.4),
      relative: false,
      parallel: input.parallel,
    };
  }

  return {
    // Coarsen further on attempt >=2; cap angular deflection at 1.2 rad.
    linearDeflection: input.linearDeflection0 * 4,
    angularDeflection: Math.min(1.2, input.angularDeflection0 * 1.8),
    relative: false,
    parallel: input.parallel,
  };
}
