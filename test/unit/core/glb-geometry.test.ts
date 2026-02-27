import { describe, expect, it } from 'vitest';
import {
  computeBoundsMeters,
  maxDimension,
  summarizeGlbGeometry,
} from '../../../src/core/glb-geometry';

function buildGlbFromJson(json: unknown) {
  const text = JSON.stringify(json);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const paddedLength = Math.ceil(bytes.length / 4) * 4;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded.fill(0x20, bytes.length);

  const totalLength = 12 + 8 + paddedLength;
  const glb = new Uint8Array(totalLength);
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, paddedLength, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  glb.set(padded, 20);
  return glb;
}

describe('glb-geometry', () => {
  it('computes bounds from accessor min/max', () => {
    const glb = buildGlbFromJson({
      asset: { version: '2.0' },
      accessors: [
        { count: 6 },
        { min: [-1, -2, -3], max: [1, 2, 3] },
      ],
      meshes: [
        {
          primitives: [
            {
              attributes: { POSITION: 1 },
              indices: 0,
            },
          ],
        },
      ],
      nodes: [{ mesh: 0 }],
    });

    const bounds = computeBoundsMeters(glb);
    expect(bounds).toEqual({ min: [-1, -2, -3], max: [1, 2, 3] });
    expect(maxDimension(bounds)).toBe(6);
  });

  it('skips invalid min/max accessors and uses valid ones', () => {
    const glb = buildGlbFromJson({
      asset: { version: '2.0' },
      accessors: [
        { min: [0, 0, 0], max: [1, 1, 1] },
        { min: [0, 0], max: [1, 1, 1] },
        { min: [0, 'NaN', 0], max: [1, 1, 1] },
      ],
      meshes: [
        {
          primitives: [
            { attributes: { POSITION: 0 } },
            { attributes: { POSITION: 1 } },
            { attributes: { POSITION: 2 } },
            { attributes: { POSITION: 10 } },
          ],
        },
      ],
    });

    const bounds = computeBoundsMeters(glb);
    expect(bounds).toEqual({ min: [0, 0, 0], max: [1, 1, 1] });
  });

  it('falls back to BIN data when min/max are missing', () => {
    const positions = new Float32Array([
      -2, -1, 0,
      3, 4, 5,
    ]);
    const bin = new Uint8Array(positions.buffer);
    const json = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: bin.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.byteLength }],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 2,
          type: 'VEC3',
        },
      ],
      meshes: [
        {
          primitives: [
            {
              attributes: { POSITION: 0 },
            },
          ],
        },
      ],
      nodes: [{ mesh: 0 }],
    };

    const glb = buildGlbFromJson(json);
    // Patch BIN into the GLB (append a BIN chunk).
    const totalLength = glb.byteLength + 8 + bin.byteLength;
    const out = new Uint8Array(totalLength);
    out.set(glb, 0);
    const view = new DataView(out.buffer);
    view.setUint32(8, totalLength, true);
    view.setUint32(glb.byteLength, bin.byteLength, true);
    view.setUint32(glb.byteLength + 4, 0x004e4942, true); // 'BIN'
    out.set(bin, glb.byteLength + 8);

    const bounds = computeBoundsMeters(out);
    expect(bounds).toEqual({ min: [-2, -1, 0], max: [3, 4, 5] });
  });

  it('summarizes geometry with non-indexed primitives', () => {
    const glb = buildGlbFromJson({
      asset: { version: '2.0' },
      accessors: [{ count: 9 }],
      meshes: [
        {
          primitives: [
            {
              attributes: { POSITION: 0 },
            },
          ],
        },
      ],
      nodes: [{ mesh: 0 }],
    });

    const summary = summarizeGlbGeometry(glb);
    expect(summary.triangles).toBe(3);
    expect(summary.primitivesWithPositionCount).toBe(1);
    expect(summary.nodesWithMeshCount).toBe(1);
  });

  it('summarizes geometry when accessors are missing', () => {
    const glb = buildGlbFromJson({
      asset: { version: '2.0' },
      accessors: {},
      meshes: [
        {
          primitives: [
            {
              attributes: { POSITION: 0 },
            },
          ],
        },
      ],
      nodes: [],
    });

    const summary = summarizeGlbGeometry(glb);
    expect(summary.triangles).toBe(0);
    expect(summary.primitiveCount).toBe(1);
  });

  it('throws on missing meshes/accessors', () => {
    const glb = buildGlbFromJson({ asset: { version: '2.0' } });
    expect(() => computeBoundsMeters(glb)).toThrow(
      'Invalid GLB: missing meshes/accessors'
    );
  });

  it('throws when BIN data is required but missing', () => {
    const glb = buildGlbFromJson({
      asset: { version: '2.0' },
      accessors: [{ count: 3 }],
      meshes: [
        {
          primitives: [
            {
              attributes: { POSITION: 0 },
            },
          ],
        },
      ],
    });

    expect(() => computeBoundsMeters(glb)).toThrow(
      'Invalid GLB: missing BIN/bufferViews for bounds'
    );
  });

  it('throws when BIN fallback cannot compute bounds', () => {
    const positions = new Float32Array([1, 2, 3]);
    const bin = new Uint8Array(positions.buffer);
    const json = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: bin.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.byteLength }],
      accessors: [
        {
          bufferView: 0,
          componentType: 5123,
          count: 1,
          type: 'VEC2',
        },
      ],
      meshes: [
        {
          primitives: [
            {
              attributes: { POSITION: 0 },
            },
          ],
        },
      ],
      nodes: [{ mesh: 0 }],
    };

    const glb = buildGlbFromJson(json);
    const totalLength = glb.byteLength + 8 + bin.byteLength;
    const out = new Uint8Array(totalLength);
    out.set(glb, 0);
    const view = new DataView(out.buffer);
    view.setUint32(8, totalLength, true);
    view.setUint32(glb.byteLength, bin.byteLength, true);
    view.setUint32(glb.byteLength + 4, 0x004e4942, true); // 'BIN'
    out.set(bin, glb.byteLength + 8);

    expect(() => computeBoundsMeters(out)).toThrow('Failed to compute bounds');
  });

  it('throws when fallback accessors are missing or bufferViews are invalid', () => {
    const bin = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const json = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: bin.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.byteLength }],
      accessors: [
        {
          bufferView: 1,
          componentType: 5126,
          count: 1,
          type: 'VEC3',
        },
      ],
      meshes: [
        {
          primitives: [
            { attributes: { POSITION: 0 } },
            { attributes: { POSITION: 1 } },
          ],
        },
      ],
    };

    const glb = buildGlbFromJson(json);
    const totalLength = glb.byteLength + 8 + bin.byteLength;
    const out = new Uint8Array(totalLength);
    out.set(glb, 0);
    const view = new DataView(out.buffer);
    view.setUint32(8, totalLength, true);
    view.setUint32(glb.byteLength, bin.byteLength, true);
    view.setUint32(glb.byteLength + 4, 0x004e4942, true); // 'BIN'
    out.set(bin, glb.byteLength + 8);

    expect(() => computeBoundsMeters(out)).toThrow('Failed to compute bounds');
  });

  it('throws when no POSITION accessors are present', () => {
    const bin = new Uint8Array([0, 0, 0, 0]);
    const json = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: bin.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.byteLength }],
      accessors: [],
      meshes: [
        {
          primitives: [
            {
              attributes: {},
            },
          ],
        },
      ],
    };

    const glb = buildGlbFromJson(json);
    const totalLength = glb.byteLength + 8 + bin.byteLength;
    const out = new Uint8Array(totalLength);
    out.set(glb, 0);
    const view = new DataView(out.buffer);
    view.setUint32(8, totalLength, true);
    view.setUint32(glb.byteLength, bin.byteLength, true);
    view.setUint32(glb.byteLength + 4, 0x004e4942, true); // 'BIN'
    out.set(bin, glb.byteLength + 8);

    expect(() => computeBoundsMeters(out)).toThrow('Failed to compute bounds');
  });

  it('throws when BIN accessor data is truncated', () => {
    const bin = new Uint8Array(8);
    const json = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: bin.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.byteLength }],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 1,
          type: 'VEC3',
        },
      ],
      meshes: [
        {
          primitives: [
            {
              attributes: { POSITION: 0 },
            },
          ],
        },
      ],
    };

    const glb = buildGlbFromJson(json);
    const totalLength = glb.byteLength + 8 + bin.byteLength;
    const out = new Uint8Array(totalLength);
    out.set(glb, 0);
    const view = new DataView(out.buffer);
    view.setUint32(8, totalLength, true);
    view.setUint32(glb.byteLength, bin.byteLength, true);
    view.setUint32(glb.byteLength + 4, 0x004e4942, true); // 'BIN'
    out.set(bin, glb.byteLength + 8);

    expect(() => computeBoundsMeters(out)).toThrow('Failed to compute bounds');
  });

  it('summarizes triangle counts and mesh stats', () => {
    const glb = buildGlbFromJson({
      asset: { version: '2.0' },
      accessors: [
        { count: 6 },
        { count: 4 },
      ],
      meshes: [
        {
          primitives: [
            {
              attributes: { POSITION: 1 },
              indices: 0,
            },
          ],
        },
      ],
      nodes: [{ mesh: 0 }],
    });

    const stats = summarizeGlbGeometry(glb);
    expect(stats.triangles).toBe(2);
    expect(stats.meshCount).toBe(1);
    expect(stats.nodeCount).toBe(1);
    expect(stats.primitiveCount).toBe(1);
    expect(stats.nodesWithMeshCount).toBe(1);
    expect(stats.primitivesWithPositionCount).toBe(1);
  });

  it('ignores non-triangle primitives', () => {
    const glb = buildGlbFromJson({
      asset: { version: '2.0' },
      accessors: [{ count: 6 }],
      meshes: [
        {
          primitives: [
            {
              attributes: { POSITION: 0 },
              mode: 1,
            },
          ],
        },
      ],
      nodes: [],
    });

    const stats = summarizeGlbGeometry(glb);
    expect(stats.triangles).toBe(0);
    expect(stats.primitiveCount).toBe(1);
    expect(stats.primitivesWithPositionCount).toBe(1);
    expect(stats.nodesWithMeshCount).toBe(0);
  });

  it('handles primitives with missing or invalid indices', () => {
    const glb = buildGlbFromJson({
      asset: { version: '2.0' },
      accessors: [
        { count: 0 },
        { count: 'nope' },
      ],
      meshes: [
        {
          primitives: [
            { indices: 0 },
            { indices: 1, attributes: { POSITION: 1 } },
          ],
        },
      ],
      nodes: [],
    });

    const stats = summarizeGlbGeometry(glb);
    expect(stats.triangles).toBe(0);
    expect(stats.primitiveCount).toBe(2);
    expect(stats.primitivesWithPositionCount).toBe(1);
  });
});
