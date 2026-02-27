import { describe, expect, it } from 'vitest';

import {
  TRIANGLE_EXPLOSION_THRESHOLDS,
  getTriangulationForAttempt,
  isTriangleExplosion,
} from '../../../src/core/triangulation-policy';

describe('triangulation-policy', () => {
  it('isTriangleExplosion returns true when thresholds exceeded', () => {
    expect(
      isTriangleExplosion({
        triangles: TRIANGLE_EXPLOSION_THRESHOLDS.MAX_TRIANGLES,
        primitiveCount: 0,
      })
    ).toBe(false);

    expect(
      isTriangleExplosion({
        triangles: TRIANGLE_EXPLOSION_THRESHOLDS.MAX_TRIANGLES + 1,
        primitiveCount: 0,
      })
    ).toBe(true);

    expect(
      isTriangleExplosion({
        triangles: 0,
        primitiveCount: TRIANGLE_EXPLOSION_THRESHOLDS.MAX_PRIMITIVES,
      })
    ).toBe(false);

    expect(
      isTriangleExplosion({
        triangles: 0,
        primitiveCount: TRIANGLE_EXPLOSION_THRESHOLDS.MAX_PRIMITIVES + 1,
      })
    ).toBe(true);
  });

  it('getTriangulationForAttempt returns the pinned attempt schedule', () => {
    expect(
      getTriangulationForAttempt(
        { linearDeflection0: 1, angularDeflection0: 0.5, parallel: true },
        0
      )
    ).toEqual({
      linearDeflection: 1,
      angularDeflection: 0.5,
      relative: false,
      parallel: true,
    });

    expect(
      getTriangulationForAttempt(
        { linearDeflection0: 1, angularDeflection0: 0.5, parallel: true },
        1
      )
    ).toEqual({
      linearDeflection: 2,
      angularDeflection: 0.7,
      relative: false,
      parallel: true,
    });

    expect(
      getTriangulationForAttempt(
        { linearDeflection0: 1, angularDeflection0: 0.5, parallel: true },
        2
      )
    ).toEqual({
      linearDeflection: 4,
      angularDeflection: 0.9,
      relative: false,
      parallel: true,
    });
  });
});
