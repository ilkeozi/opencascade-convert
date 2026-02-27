import type { TriangulateOptions } from './types';

export const TRIANGLE_EXPLOSION_THRESHOLDS = {
  MAX_TRIANGLES: 5_000_000,
  MAX_PRIMITIVES: 50_000,
} as const;

export type MeshStatsLike = {
  triangles: number;
  primitiveCount: number;
};

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
      linearDeflection: input.linearDeflection0 * 2,
      angularDeflection: Math.min(1.0, input.angularDeflection0 * 1.4),
      relative: false,
      parallel: input.parallel,
    };
  }

  return {
    linearDeflection: input.linearDeflection0 * 4,
    angularDeflection: Math.min(1.2, input.angularDeflection0 * 1.8),
    relative: false,
    parallel: input.parallel,
  };
}
