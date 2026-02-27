import { parseGlbBin, parseGlbJson } from './glb-parse';

export type GlbBounds = {
  min: [number, number, number];
  max: [number, number, number];
};

export type GlbGeometryStats = {
  triangles: number;
  meshCount: number;
  nodeCount: number;
  primitiveCount: number;
  nodesWithMeshCount: number;
  primitivesWithPositionCount: number;
};

/**
 * Computes axis-aligned bounds in meters from a GLB buffer.
 * Uses accessor min/max when available; falls back to BIN position data otherwise.
 * @throws Error when required meshes/accessors/BIN data are missing or invalid.
 */
export function computeBoundsMeters(glb: Uint8Array): GlbBounds {
  const gltf = parseGlbJson(glb) as any;
  if (!gltf || !Array.isArray(gltf.meshes) || !Array.isArray(gltf.accessors)) {
    throw new Error('Invalid GLB: missing meshes/accessors');
  }

  const accessors = gltf.accessors as any[];
  const meshes = gltf.meshes as any[];

  const mins = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];
  const maxs = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];

  const positionAccessorIndices = new Set<number>();
  meshes.forEach((mesh) => {
    (mesh?.primitives ?? []).forEach((prim: any) => {
      const idx = prim?.attributes?.POSITION;
      if (typeof idx === 'number') {
        positionAccessorIndices.add(idx);
      }
    });
  });

  const updateFromMinMax = (min: any, max: any) => {
    if (
      !Array.isArray(min) ||
      !Array.isArray(max) ||
      min.length < 3 ||
      max.length < 3
    ) {
      return false;
    }
    for (let i = 0; i < 3; i += 1) {
      const a = Number(min[i]);
      const b = Number(max[i]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        return false;
      }
      mins[i] = Math.min(mins[i], a);
      maxs[i] = Math.max(maxs[i], b);
    }
    return true;
  };

  let usedAny = false;
  for (const accessorIndex of positionAccessorIndices) {
    const accessor = accessors[accessorIndex];
    if (accessor && updateFromMinMax(accessor.min, accessor.max)) {
      usedAny = true;
    }
  }

  if (!usedAny) {
    const bin = parseGlbBin(glb);
    if (!bin || !Array.isArray(gltf.bufferViews)) {
      throw new Error('Invalid GLB: missing BIN/bufferViews for bounds');
    }
    const bufferViews = gltf.bufferViews as any[];
    const binView = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);

    for (const accessorIndex of positionAccessorIndices) {
      const accessor = accessors[accessorIndex];
      if (
        !accessor ||
        accessor.type !== 'VEC3' ||
        accessor.componentType !== 5126 // Float32
      ) {
        continue;
      }
      const bv = bufferViews[accessor.bufferView];
      if (!bv) continue;
      const bvOffset = Number(bv.byteOffset ?? 0);
      const accOffset = Number(accessor.byteOffset ?? 0);
      const start = bvOffset + accOffset;
      const count = Number(accessor.count ?? 0);
      const stride = Number(bv.byteStride ?? 12); // 3 * 4-byte floats
      for (let i = 0; i < count; i += 1) {
        const off = start + i * stride;
        if (off + 12 > binView.byteLength) break;
        const x = binView.getFloat32(off + 0, true);
        const y = binView.getFloat32(off + 4, true);
        const z = binView.getFloat32(off + 8, true);
        mins[0] = Math.min(mins[0], x);
        mins[1] = Math.min(mins[1], y);
        mins[2] = Math.min(mins[2], z);
        maxs[0] = Math.max(maxs[0], x);
        maxs[1] = Math.max(maxs[1], y);
        maxs[2] = Math.max(maxs[2], z);
        usedAny = true;
      }
    }
  }

  if (
    !usedAny ||
    !mins.every(Number.isFinite) ||
    !maxs.every(Number.isFinite)
  ) {
    throw new Error('Failed to compute bounds');
  }
  return {
    min: mins as [number, number, number],
    max: maxs as [number, number, number],
  };
}

/**
 * Returns the maximum axis length from bounds.
 */
export function maxDimension(bounds: GlbBounds) {
  const dx = bounds.max[0] - bounds.min[0];
  const dy = bounds.max[1] - bounds.min[1];
  const dz = bounds.max[2] - bounds.min[2];
  return Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
}

/**
 * Summarizes mesh and node counts from a GLB buffer.
 * Triangles are counted from indices when present; otherwise from POSITION accessor counts.
 * Only TRIANGLES mode (4) contributes to triangle counts.
 */
export function summarizeGlbGeometry(glb: Uint8Array): GlbGeometryStats {
  const gltf = parseGlbJson(glb) as any;
  const accessors = Array.isArray(gltf?.accessors)
    ? (gltf.accessors as any[])
    : [];
  const meshes = Array.isArray(gltf?.meshes) ? (gltf.meshes as any[]) : [];
  const nodes = Array.isArray(gltf?.nodes) ? (gltf.nodes as any[]) : [];

  let triangles = 0;
  let primitiveCount = 0;
  let primitivesWithPositionCount = 0;

  meshes.forEach((mesh) => {
    (mesh?.primitives ?? []).forEach((prim: any) => {
      primitiveCount += 1;

      const posAccessorIndex = prim?.attributes?.POSITION;
      if (typeof posAccessorIndex === 'number') {
        primitivesWithPositionCount += 1;
      }

      const mode = typeof prim?.mode === 'number' ? prim.mode : 4; // TRIANGLES
      if (mode !== 4) {
        return;
      }

      if (typeof prim?.indices === 'number') {
        const accessor = accessors[prim.indices];
        const count = Number(accessor?.count);
        if (Number.isFinite(count) && count > 0) {
          triangles += Math.floor(count / 3);
        }
        return;
      }

      if (typeof posAccessorIndex === 'number') {
        const accessor = accessors[posAccessorIndex];
        const count = Number(accessor?.count);
        if (Number.isFinite(count) && count > 0) {
          triangles += Math.floor(count / 3);
        }
      }
    });
  });

  const nodesWithMeshCount = nodes.filter(
    (node) => typeof node?.mesh === 'number'
  ).length;

  return {
    triangles,
    meshCount: meshes.length,
    nodeCount: nodes.length,
    primitiveCount,
    nodesWithMeshCount,
    primitivesWithPositionCount,
  };
}
